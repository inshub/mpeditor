import { useEffect, useMemo } from "react";
import {
  disable as disableAutoLaunch,
  enable as enableAutoLaunch,
} from "@tauri-apps/plugin-autostart";
import { toast } from "sonner";
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";

type PreviewDevice = "mobile" | "tablet" | "pc";
type ThemeMode = "light" | "dark" | "system";
type ImageHostProvider = "wechat" | "aliyun";
type AiLabProvider = "modelscope";

interface WechatAccount {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
}

interface SettingsDraft {
  themeMode: ThemeMode;
  language: "zh" | "en";
  autoLaunchEnabled: boolean;
  startupRestoreEnabled: boolean;
  proxyEnabled: boolean;
  socksProxy: string;
  httpProxy: string;
  httpsProxy: string;
  themeId: string;
  previewDevice: PreviewDevice;
  scrollSyncEnabled: boolean;
  imageHostProvider: ImageHostProvider;
  imageHostWechatAccountId: string;
  wechatProxyUrl: string;
  wechatAccounts: WechatAccount[];
  defaultWechatAccountId: string;
  aliyunAccessKeyId: string;
  aliyunAccessKeySecret: string;
  aliyunBucket: string;
  aliyunRegion: string;
  aliyunUseSSL: boolean;
  aliyunCdnDomain: string;
  aliyunPathPrefix: string;
  aiLabProvider: AiLabProvider;
  aiLabApiEndpoint: string;
  aiLabApiKey: string;
  aiLabModel: string;
  aiLabImageSize: string;
}

interface UseSettingsDraftManagerOptions {
  t: TFunction;
  isTauriRuntime: () => boolean;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  settingsDraft: SettingsDraft;
  setSettingsDraft: Dispatch<SetStateAction<SettingsDraft>>;
  resetWechatAccountForm: () => void;
  normalizeWechatProxyUrl: (value: string) => string;
  defaultAiLabImageSize: string;
  source: {
    themeMode: ThemeMode;
    language: "zh" | "en";
    autoLaunchEnabled: boolean;
    startupRestoreEnabled: boolean;
    proxyEnabled: boolean;
    socksProxy: string;
    httpProxy: string;
    httpsProxy: string;
    themeId: string;
    previewDevice: PreviewDevice;
    scrollSyncEnabled: boolean;
    imageHostProvider: ImageHostProvider;
    imageHostWechatAccountId: string;
    wechatProxyUrl: string;
    wechatAccounts: WechatAccount[];
    defaultWechatAccountId: string;
    aliyunAccessKeyId: string;
    aliyunAccessKeySecret: string;
    aliyunBucket: string;
    aliyunRegion: string;
    aliyunUseSSL: boolean;
    aliyunCdnDomain: string;
    aliyunPathPrefix: string;
    aiLabProvider: AiLabProvider;
    aiLabApiEndpoint: string;
    aiLabApiKey: string;
    aiLabModel: string;
    aiLabImageSize: string;
  };
  setters: {
    setAutoLaunchEnabled: Dispatch<SetStateAction<boolean>>;
    setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
    setLanguage: Dispatch<SetStateAction<"zh" | "en">>;
    setStartupRestoreEnabled: Dispatch<SetStateAction<boolean>>;
    setProxyEnabled: Dispatch<SetStateAction<boolean>>;
    setSocksProxy: Dispatch<SetStateAction<string>>;
    setHttpProxy: Dispatch<SetStateAction<string>>;
    setHttpsProxy: Dispatch<SetStateAction<string>>;
    setActiveTheme: Dispatch<SetStateAction<string>>;
    setDefaultThemeId: Dispatch<SetStateAction<string>>;
    setPreviewDevice: Dispatch<SetStateAction<PreviewDevice>>;
    setDefaultPreviewDevice: Dispatch<SetStateAction<PreviewDevice>>;
    setScrollSyncEnabled: Dispatch<SetStateAction<boolean>>;
    setImageHostProvider: Dispatch<SetStateAction<ImageHostProvider>>;
    setImageHostWechatAccountId: Dispatch<SetStateAction<string>>;
    setWechatProxyUrl: Dispatch<SetStateAction<string>>;
    setWechatAccounts: Dispatch<SetStateAction<WechatAccount[]>>;
    setDefaultWechatAccountId: Dispatch<SetStateAction<string>>;
    setAliyunAccessKeyId: Dispatch<SetStateAction<string>>;
    setAliyunAccessKeySecret: Dispatch<SetStateAction<string>>;
    setAliyunBucket: Dispatch<SetStateAction<string>>;
    setAliyunRegion: Dispatch<SetStateAction<string>>;
    setAliyunUseSSL: Dispatch<SetStateAction<boolean>>;
    setAliyunCdnDomain: Dispatch<SetStateAction<string>>;
    setAliyunPathPrefix: Dispatch<SetStateAction<string>>;
    setAiLabProvider: Dispatch<SetStateAction<AiLabProvider>>;
    setAiLabApiEndpoint: Dispatch<SetStateAction<string>>;
    setAiLabApiKey: Dispatch<SetStateAction<string>>;
    setAiLabModel: Dispatch<SetStateAction<string>>;
    setAiLabImageSize: Dispatch<SetStateAction<string>>;
  };
}

const normalizeDraft = (
  draft: SettingsDraft,
  normalizeWechatProxyUrl: (value: string) => string
) => ({
  ...draft,
  socksProxy: draft.socksProxy.trim(),
  httpProxy: draft.httpProxy.trim(),
  httpsProxy: draft.httpsProxy.trim(),
  wechatProxyUrl: normalizeWechatProxyUrl(draft.wechatProxyUrl),
  aliyunAccessKeyId: draft.aliyunAccessKeyId.trim(),
  aliyunAccessKeySecret: draft.aliyunAccessKeySecret.trim(),
  aliyunBucket: draft.aliyunBucket.trim(),
  aliyunRegion: draft.aliyunRegion.trim(),
  aliyunCdnDomain: draft.aliyunCdnDomain.trim(),
  aliyunPathPrefix: draft.aliyunPathPrefix.trim(),
  aiLabApiEndpoint: draft.aiLabApiEndpoint.trim(),
  aiLabApiKey: draft.aiLabApiKey.trim(),
  aiLabModel: draft.aiLabModel.trim(),
  aiLabImageSize: draft.aiLabImageSize.trim(),
});

export function useSettingsDraftManager({
  t,
  isTauriRuntime,
  settingsOpen,
  setSettingsOpen,
  settingsDraft,
  setSettingsDraft,
  resetWechatAccountForm,
  normalizeWechatProxyUrl,
  defaultAiLabImageSize,
  source,
  setters,
}: UseSettingsDraftManagerOptions) {
  useEffect(() => {
    if (!settingsOpen) return;
    setSettingsDraft((prev) => ({
      ...prev,
      autoLaunchEnabled: source.autoLaunchEnabled,
      startupRestoreEnabled: source.startupRestoreEnabled,
    }));
  }, [settingsOpen, source.autoLaunchEnabled, source.startupRestoreEnabled, setSettingsDraft]);

  useEffect(() => {
    if (!settingsOpen) return;
    setSettingsDraft({
      themeMode: source.themeMode,
      language: source.language,
      autoLaunchEnabled: source.autoLaunchEnabled,
      startupRestoreEnabled: source.startupRestoreEnabled,
      proxyEnabled: source.proxyEnabled,
      socksProxy: source.socksProxy,
      httpProxy: source.httpProxy,
      httpsProxy: source.httpsProxy,
      themeId: source.themeId,
      previewDevice: source.previewDevice,
      scrollSyncEnabled: source.scrollSyncEnabled,
      imageHostProvider: source.imageHostProvider,
      imageHostWechatAccountId: source.imageHostWechatAccountId,
      wechatProxyUrl: source.wechatProxyUrl,
      wechatAccounts: source.wechatAccounts,
      defaultWechatAccountId: source.defaultWechatAccountId,
      aliyunAccessKeyId: source.aliyunAccessKeyId,
      aliyunAccessKeySecret: source.aliyunAccessKeySecret,
      aliyunBucket: source.aliyunBucket,
      aliyunRegion: source.aliyunRegion,
      aliyunUseSSL: source.aliyunUseSSL,
      aliyunCdnDomain: source.aliyunCdnDomain,
      aliyunPathPrefix: source.aliyunPathPrefix,
      aiLabProvider: source.aiLabProvider,
      aiLabApiEndpoint: source.aiLabApiEndpoint,
      aiLabApiKey: source.aiLabApiKey,
      aiLabModel: source.aiLabModel,
      aiLabImageSize: source.aiLabImageSize,
    });
    resetWechatAccountForm();
  }, [
    settingsOpen,
    source.themeMode,
    source.language,
    source.autoLaunchEnabled,
    source.startupRestoreEnabled,
    source.proxyEnabled,
    source.socksProxy,
    source.httpProxy,
    source.httpsProxy,
    source.themeId,
    source.previewDevice,
    source.scrollSyncEnabled,
    source.imageHostProvider,
    source.imageHostWechatAccountId,
    source.wechatProxyUrl,
    source.wechatAccounts,
    source.defaultWechatAccountId,
    source.aliyunAccessKeyId,
    source.aliyunAccessKeySecret,
    source.aliyunBucket,
    source.aliyunRegion,
    source.aliyunUseSSL,
    source.aliyunCdnDomain,
    source.aliyunPathPrefix,
    source.aiLabProvider,
    source.aiLabApiEndpoint,
    source.aiLabApiKey,
    source.aiLabModel,
    source.aiLabImageSize,
    setSettingsDraft,
    resetWechatAccountForm,
  ]);

  const currentSettingsSnapshot = useMemo(
    () =>
      normalizeDraft(
        {
          themeMode: source.themeMode,
          language: source.language,
          autoLaunchEnabled: source.autoLaunchEnabled,
          startupRestoreEnabled: source.startupRestoreEnabled,
          proxyEnabled: source.proxyEnabled,
          socksProxy: source.socksProxy,
          httpProxy: source.httpProxy,
          httpsProxy: source.httpsProxy,
          themeId: source.themeId,
          previewDevice: source.previewDevice,
          scrollSyncEnabled: source.scrollSyncEnabled,
          imageHostProvider: source.imageHostProvider,
          imageHostWechatAccountId: source.imageHostWechatAccountId,
          wechatProxyUrl: source.wechatProxyUrl,
          wechatAccounts: source.wechatAccounts,
          defaultWechatAccountId: source.defaultWechatAccountId,
          aliyunAccessKeyId: source.aliyunAccessKeyId,
          aliyunAccessKeySecret: source.aliyunAccessKeySecret,
          aliyunBucket: source.aliyunBucket,
          aliyunRegion: source.aliyunRegion,
          aliyunUseSSL: source.aliyunUseSSL,
          aliyunCdnDomain: source.aliyunCdnDomain,
          aliyunPathPrefix: source.aliyunPathPrefix,
          aiLabProvider: source.aiLabProvider,
          aiLabApiEndpoint: source.aiLabApiEndpoint,
          aiLabApiKey: source.aiLabApiKey,
          aiLabModel: source.aiLabModel,
          aiLabImageSize: source.aiLabImageSize,
        },
        normalizeWechatProxyUrl
      ),
    [source, normalizeWechatProxyUrl]
  );

  const settingsIsDirty =
    JSON.stringify(normalizeDraft(settingsDraft, normalizeWechatProxyUrl)) !==
    JSON.stringify(currentSettingsSnapshot);

  const applySettingsDraft = async (closeDialog = true) => {
    if (isTauriRuntime()) {
      try {
        if (settingsDraft.autoLaunchEnabled) await enableAutoLaunch();
        else await disableAutoLaunch();
      } catch (err) {
        toast.error(
          t("workspace.feedback.autoLaunchToggleFailed", {
            message: err instanceof Error ? err.message : typeof err === "string" ? err : t("workspace.feedback.unknownError"),
          })
        );
        throw err;
      }
    }

    setters.setAutoLaunchEnabled(settingsDraft.autoLaunchEnabled);
    setters.setThemeMode(settingsDraft.themeMode);
    setters.setLanguage(settingsDraft.language);
    setters.setStartupRestoreEnabled(settingsDraft.startupRestoreEnabled);
    setters.setProxyEnabled(settingsDraft.proxyEnabled);
    setters.setSocksProxy(settingsDraft.socksProxy.trim());
    setters.setHttpProxy(settingsDraft.httpProxy.trim());
    setters.setHttpsProxy(settingsDraft.httpsProxy.trim());
    setters.setActiveTheme(settingsDraft.themeId);
    setters.setDefaultThemeId(settingsDraft.themeId);
    setters.setPreviewDevice(settingsDraft.previewDevice);
    setters.setDefaultPreviewDevice(settingsDraft.previewDevice);
    setters.setScrollSyncEnabled(settingsDraft.scrollSyncEnabled);
    setters.setImageHostProvider(settingsDraft.imageHostProvider);
    setters.setImageHostWechatAccountId(settingsDraft.imageHostWechatAccountId);
    setters.setWechatProxyUrl(normalizeWechatProxyUrl(settingsDraft.wechatProxyUrl));
    setters.setWechatAccounts(settingsDraft.wechatAccounts);
    setters.setDefaultWechatAccountId(settingsDraft.defaultWechatAccountId);
    setters.setAliyunAccessKeyId(settingsDraft.aliyunAccessKeyId.trim());
    setters.setAliyunAccessKeySecret(settingsDraft.aliyunAccessKeySecret.trim());
    setters.setAliyunBucket(settingsDraft.aliyunBucket.trim());
    setters.setAliyunRegion(settingsDraft.aliyunRegion.trim());
    setters.setAliyunUseSSL(settingsDraft.aliyunUseSSL);
    setters.setAliyunCdnDomain(settingsDraft.aliyunCdnDomain.trim());
    setters.setAliyunPathPrefix(settingsDraft.aliyunPathPrefix.trim());
    setters.setAiLabProvider(settingsDraft.aiLabProvider);
    setters.setAiLabApiEndpoint(settingsDraft.aiLabApiEndpoint.trim());
    setters.setAiLabApiKey(settingsDraft.aiLabApiKey.trim());
    setters.setAiLabModel(settingsDraft.aiLabModel.trim());
    setters.setAiLabImageSize(settingsDraft.aiLabImageSize.trim() || defaultAiLabImageSize);
    if (closeDialog) {
      setSettingsOpen(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await applySettingsDraft(true);
    } catch {
      // Error toast already shown in applySettingsDraft.
    }
  };

  const handleSaveSettingsInPlace = async () => {
    await applySettingsDraft(false);
  };

  return {
    settingsIsDirty,
    handleSaveSettings,
    handleSaveSettingsInPlace,
  };
}
