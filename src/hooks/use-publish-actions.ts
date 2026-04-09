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

    const traceId = `upload-clipboard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = Date.now();
    try {
      console.info(
        `[publish-upload] start trace=${traceId} file=${file.name || "clipboard"} size=${file.size} type=${file.type || "unknown"} provider=${imageHostProvider}`
      );
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
      console.info(
        `[publish-upload] success trace=${traceId} duration_ms=${Date.now() - startedAt} provider=${response.provider} has_url=${Boolean(response.url)}`
      );
      return response.url;
    } catch (err) {
      console.error(
        `[publish-upload] failed trace=${traceId} duration_ms=${Date.now() - startedAt}`,
        err
      );
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

    const traceId = `upload-content-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = Date.now();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const images = Array.from(doc.querySelectorAll("img"));
    if (!images.length) {
      console.info(`[publish-upload-content] no_images trace=${traceId}`);
      return html;
    }

    const basePayload = buildImageHostUploadPayload();
    console.info(
      `[publish-upload-content] start trace=${traceId} image_count=${images.length} provider=${imageHostProvider}`
    );

    let uploadedCount = 0;
    let skippedCount = 0;

    for (const [index, image] of images.entries()) {
      const src = image.getAttribute("src")?.trim();
      if (!src) {
        skippedCount += 1;
        console.info(`[publish-upload-content] skip_empty_src trace=${traceId} index=${index}`);
        continue;
      }
      if (src.startsWith("https://mmbiz.qpic.cn/") || src.startsWith("http://mmbiz.qpic.cn/")) {
        skippedCount += 1;
        console.info(`[publish-upload-content] skip_wechat_cdn trace=${traceId} index=${index}`);
        continue;
      }

      const payload: UploadImageSourceRequestPayload = {
        src,
        ...basePayload,
      };

      const itemStartedAt = Date.now();
      console.info(
        `[publish-upload-content] upload_start trace=${traceId} index=${index} src_prefix=${src.slice(0, 120)}`
      );
      const response = await invoke<UploadImageResponsePayload>("upload_image_source_to_host", {
        request: payload,
      });
      if (!response?.url) {
        throw new Error(t("workspace.feedback.contentUploadEmptyUrl"));
      }
      image.setAttribute("src", response.url);
      uploadedCount += 1;
      console.info(
        `[publish-upload-content] upload_done trace=${traceId} index=${index} duration_ms=${Date.now() - itemStartedAt} provider=${response.provider}`
      );
    }

    console.info(
      `[publish-upload-content] done trace=${traceId} duration_ms=${Date.now() - startedAt} uploaded=${uploadedCount} skipped=${skippedCount}`
    );
    return doc.body.innerHTML;
  };

  const handlePublishToDraft = async () => {
    const account = getDefaultWechatAccount();
    if (!account) {
      toast.error(t("workspace.feedback.defaultWechatAccountRequired"));
      return;
    }

    setIsPublishingDraft(true);
    const startedAt = Date.now();
    const traceId = `publish-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const title = activeDocumentTitle || t("workspace.sidebar.untitled");
      console.info(
        `[publish] start trace=${traceId} title_len=${title.length} html_len=${renderedHtml.length} theme=${previewThemeId} proxy_enabled=${networkProxy.enabled}`
      );
      const compatStart = Date.now();
      console.info(`[publish] stage=wechat_compat trace=${traceId}`);
      const compatibleHtml = await makeWeChatCompatible(renderedHtml, previewThemeId, {
        convertImagesToBase64: false,
      });
      const compatElapsed = Date.now() - compatStart;
      console.info(
        `[publish] stage=wechat_compat_done trace=${traceId} duration_ms=${compatElapsed} output_len=${compatibleHtml.length}`
      );
      if (compatElapsed > 400) {
        console.warn(
          `[publish] slow_compat duration_ms=${compatElapsed} input_len=${renderedHtml.length} output_len=${compatibleHtml.length}`
        );
      }
      const uploadStart = Date.now();
      console.info(`[publish] stage=upload_content_images trace=${traceId}`);
      const finalHtml = await uploadContentImagesForDraft(compatibleHtml);
      const uploadElapsed = Date.now() - uploadStart;
      console.info(
        `[publish] stage=upload_content_images_done trace=${traceId} duration_ms=${uploadElapsed} output_len=${finalHtml.length}`
      );
      if (uploadElapsed > 1000) {
        console.warn(`[publish] slow_image_upload duration_ms=${uploadElapsed} html_len=${finalHtml.length}`);
      }

      const publishInvokeTimeoutMs = 45_000;
      console.info(
        `[publish] stage=invoke_publish_wechat_draft trace=${traceId} timeout_ms=${publishInvokeTimeoutMs}`
      );
      const mediaId = await withTimeout(
        invoke<string>("publish_wechat_draft", {
          appId: account.appId,
          appSecret: account.appSecret,
          proxyDomain: buildWechatProxyDomain() || undefined,
          title,
          contentHtml: finalHtml,
          author: account.name || "",
          networkProxy,
        }),
        publishInvokeTimeoutMs,
        `发布草稿超时（${Math.round(publishInvokeTimeoutMs / 1000)} 秒），请检查代理可达性或稍后重试`
      );
      console.info(`[publish] stage=invoke_publish_wechat_draft_done trace=${traceId}`);
      toast.success(t("workspace.actions.publishSuccessTitle"), {
        description: t("workspace.actions.publishSuccessDescription", {
          title: activeDocumentTitle || t("workspace.sidebar.untitled"),
          mediaId,
        }),
      });
      const totalElapsed = Date.now() - startedAt;
      console.info(
        `[publish] success trace=${traceId} duration_ms=${totalElapsed} media_id=${mediaId}`
      );
      if (totalElapsed > 1000) {
        console.warn(`[publish] slow_publish duration_ms=${totalElapsed}`);
      }
    } catch (err) {
      console.error(
        `[publish] failed trace=${traceId} duration_ms=${Date.now() - startedAt}`,
        err
      );
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
