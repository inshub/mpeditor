import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import { makeWeChatCompatible } from "../lib/wechatCompat";

type ImageHostProvider = "wechat" | "aliyun";

interface WechatAccount {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
}

interface NetworkProxyPayload {
  enabled: boolean;
  socksProxy: string;
  httpProxy: string;
  httpsProxy: string;
}

interface UploadImageRequestPayload {
  provider: ImageHostProvider;
  fileName: string;
  mimeType: string;
  contentBase64: string;
  networkProxy?: NetworkProxyPayload;
  wechat?: {
    proxyDomain: string;
    appId: string;
    appSecret: string;
  };
  aliyun?: {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region: string;
    useSSL: boolean;
    cdnDomain: string;
    pathPrefix: string;
  };
}

interface UploadImageResponsePayload {
  provider: ImageHostProvider;
  url: string;
  objectKey?: string | null;
}

interface UploadImageSourceRequestPayload {
  provider: ImageHostProvider;
  src: string;
  networkProxy?: NetworkProxyPayload;
  wechat?: {
    proxyDomain: string;
    appId: string;
    appSecret: string;
  };
  aliyun?: {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region: string;
    useSSL: boolean;
    cdnDomain: string;
    pathPrefix: string;
  };
}

interface UsePublishActionsOptions {
  t: TFunction;
  isTauriRuntime: () => boolean;
  renderedHtml: string;
  previewThemeId: string;
  activeDocumentTitle: string;
  networkProxy: NetworkProxyPayload;
  buildWechatProxyDomain: (proxyUrl?: string) => string;
  imageHostProvider: ImageHostProvider;
  imageHostWechatAccountId: string;
  defaultWechatAccountId: string;
  wechatAccounts: WechatAccount[];
  aliyunAccessKeyId: string;
  aliyunAccessKeySecret: string;
  aliyunBucket: string;
  aliyunRegion: string;
  aliyunUseSSL: boolean;
  aliyunCdnDomain: string;
  aliyunPathPrefix: string;
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Blob base64 conversion failed"));
    reader.readAsDataURL(blob);
  });

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });

export function usePublishActions({
  t,
  isTauriRuntime,
  renderedHtml,
  previewThemeId,
  activeDocumentTitle,
  networkProxy,
  buildWechatProxyDomain,
  imageHostProvider,
  imageHostWechatAccountId,
  defaultWechatAccountId,
  wechatAccounts,
  aliyunAccessKeyId,
  aliyunAccessKeySecret,
  aliyunBucket,
  aliyunRegion,
  aliyunUseSSL,
  aliyunCdnDomain,
  aliyunPathPrefix,
}: UsePublishActionsOptions) {
  const [isPublishingDraft, setIsPublishingDraft] = useState(false);

  const getImageHostWechatAccount = () => {
    if (!wechatAccounts.length) return null;
    const preferredId = imageHostWechatAccountId || defaultWechatAccountId;
    if (!preferredId) return wechatAccounts[0];
    return wechatAccounts.find((account) => account.id === preferredId) ?? wechatAccounts[0];
  };

  const getDefaultWechatAccount = () => {
    if (!wechatAccounts.length) return null;
    const preferredId = defaultWechatAccountId || imageHostWechatAccountId;
    if (!preferredId) return wechatAccounts[0];
    return wechatAccounts.find((account) => account.id === preferredId) ?? wechatAccounts[0];
  };

  const buildImageHostUploadPayload = () => {
    const activeWechatAccount = getImageHostWechatAccount();

    if (
      imageHostProvider === "wechat" &&
      (!activeWechatAccount?.appId.trim() || !activeWechatAccount?.appSecret.trim())
    ) {
      throw new Error(t("workspace.feedback.wechatImageHostAccountMissing"));
    }

    if (
      imageHostProvider === "aliyun" &&
      (!aliyunAccessKeyId.trim() ||
        !aliyunAccessKeySecret.trim() ||
        !aliyunBucket.trim() ||
        !aliyunRegion.trim())
    ) {
      throw new Error(t("workspace.feedback.aliyunConfigMissing"));
    }

    return {
      provider: imageHostProvider,
      networkProxy,
      wechat:
        imageHostProvider === "wechat"
          ? {
              proxyDomain: buildWechatProxyDomain(),
              appId: activeWechatAccount!.appId,
              appSecret: activeWechatAccount!.appSecret,
            }
          : undefined,
      aliyun:
        imageHostProvider === "aliyun"
          ? {
              accessKeyId: aliyunAccessKeyId,
              accessKeySecret: aliyunAccessKeySecret,
              bucket: aliyunBucket,
              region: aliyunRegion,
              useSSL: aliyunUseSSL,
              cdnDomain: aliyunCdnDomain,
              pathPrefix: aliyunPathPrefix,
            }
          : undefined,
    };
  };

  const uploadClipboardImage = async (file: File): Promise<string> => {
    const fallback = () => fileToDataUrl(file);
    if (!isTauriRuntime()) {
      return fallback();
    }

    try {
      const basePayload = buildImageHostUploadPayload();
      const payload: UploadImageRequestPayload = {
        fileName: file.name || `clipboard-${Date.now()}.png`,
        mimeType: file.type || "image/png",
        contentBase64: await blobToBase64(file),
        ...basePayload,
      };

      const response = await invoke<UploadImageResponsePayload>("upload_image_to_host", {
        request: payload,
      });
      if (!response?.url) {
        throw new Error(t("workspace.feedback.uploadEmptyUrl"));
      }
      return response.url;
    } catch (err) {
      console.error("Clipboard image upload failed:", err);
      toast.error(
        t("workspace.feedback.uploadFallbackLocal", {
          message: err instanceof Error ? err.message : t("workspace.feedback.unknownError"),
        })
      );
      return fallback();
    }
  };

  const uploadContentImagesForDraft = async (html: string): Promise<string> => {
    if (!isTauriRuntime()) return html;

    const doc = new DOMParser().parseFromString(html, "text/html");
    const images = Array.from(doc.querySelectorAll("img"));
    if (!images.length) return html;

    const basePayload = buildImageHostUploadPayload();

    for (const image of images) {
      const src = image.getAttribute("src")?.trim();
      if (!src) continue;
      if (src.startsWith("https://mmbiz.qpic.cn/") || src.startsWith("http://mmbiz.qpic.cn/"))
        continue;

      const payload: UploadImageSourceRequestPayload = {
        src,
        ...basePayload,
      };

      const response = await invoke<UploadImageResponsePayload>("upload_image_source_to_host", {
        request: payload,
      });
      if (!response?.url) {
        throw new Error(t("workspace.feedback.contentUploadEmptyUrl"));
      }
      image.setAttribute("src", response.url);
    }

    return doc.body.innerHTML;
  };

  const handlePublishToDraft = async () => {
    const account = getDefaultWechatAccount();
    if (!account) {
      toast.error(t("workspace.feedback.defaultWechatAccountRequired"));
      return;
    }

    setIsPublishingDraft(true);
    try {
      const mediaId = await withTimeout(
        (async () => {
          const compatibleHtml = await makeWeChatCompatible(renderedHtml, previewThemeId, {
            convertImagesToBase64: false,
          });
          const finalHtml = await uploadContentImagesForDraft(compatibleHtml);
          return invoke<string>("publish_wechat_draft", {
            appId: account.appId,
            appSecret: account.appSecret,
            proxyDomain: buildWechatProxyDomain() || undefined,
            title: activeDocumentTitle || t("workspace.sidebar.untitled"),
            contentHtml: finalHtml,
            author: account.name || "",
            networkProxy,
          });
        })(),
        30_000,
        "发布超时（30 秒），请检查代理可达性、图片大小或稍后重试"
      );
      toast.success(t("workspace.actions.publishSuccessTitle"), {
        description: t("workspace.actions.publishSuccessDescription", {
          title: activeDocumentTitle || t("workspace.sidebar.untitled"),
          mediaId,
        }),
      });
    } catch (err) {
      console.error("Publish draft failed:", err);
      toast.error(
        t("workspace.feedback.publishDraftFailed", {
          message: err instanceof Error ? err.message : t("workspace.feedback.unknownError"),
        })
      );
    } finally {
      setIsPublishingDraft(false);
    }
  };

  return {
    isPublishingDraft,
    uploadClipboardImage,
    handlePublishToDraft,
  };
}
