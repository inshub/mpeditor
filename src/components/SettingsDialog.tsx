import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  AlertCircle,
  FolderGit2,
  GitBranch,
  Globe2,
  Image,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Toaster } from "./ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useUpdater } from "../hooks/use-updater";
import { useGitRepoManager } from "../hooks/use-git-repo-manager";
import appLogo from "../assets/logo.png";
import type { ThemeGroup } from "../lib/themes";
import { resolveUpdaterProxyUrl } from "../lib/updater";
import {
  DEFAULT_GIT_BROWSE_PREFERENCE,
  GitBrowsePreference,
  inferRepoNameFromUrl,
  normalizeContentRoot,
} from "../lib/gitContent";
import {
  changelogUrl,
  DEFAULT_AI_LAB_API_KEY,
  DEFAULT_AI_LAB_ENDPOINT,
  DEFAULT_AI_LAB_IMAGE_SIZE,
  DEFAULT_AI_LAB_MODEL,
  DEFAULT_AI_LAB_PROVIDER,
  LANGUAGE_OPTIONS,
  officialSiteUrl,
  privacyUrl,
  SETTINGS_CARD_CLASS,
  SETTINGS_DIALOG_TOASTER_ID,
  SETTINGS_INPUT_CLASS,
  SETTINGS_TOGGLE_BASE,
  termsUrl,
} from "./settings/constants";
import { useAboutVersion } from "./settings/hooks/use-about-version";
import { AboutSection } from "./settings/AboutSection";
import { LabSection } from "./settings/LabSection";
import type { GitAuthPreference, GitRepositorySnapshotPayload } from "../lib/workspace-types";

type PreviewDevice = "mobile" | "tablet" | "pc";
type ThemeMode = "light" | "dark" | "system";
type SettingsSection =
  | "general"
  | "theme"
  | "publishing"
  | "network"
  | "editor"
  | "about"
  | "imageHost"
  | "wechatConfig"
  | "lab"
  | "git";
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

interface ThemeSummary {
  id: string;
  name: string;
  description?: string;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settingsSection: SettingsSection;
  setSettingsSection: (section: SettingsSection) => void;
  settingsDraft: SettingsDraft;
  setSettingsDraft: Dispatch<SetStateAction<SettingsDraft>>;
  settingsIsDirty: boolean;
  handleSaveSettings: () => void;
  handleSaveSettingsInPlace: () => void;
  themeGroups: ThemeGroup[];
  wechatAccountNameInput: string;
  setWechatAccountNameInput: (value: string) => void;
  wechatAccountAppIdInput: string;
  setWechatAccountAppIdInput: (value: string) => void;
  wechatAccountSecretInput: string;
  setWechatAccountSecretInput: (value: string) => void;
  editingWechatAccountId: string | null;
  resetWechatAccountForm: () => void;
  saveWechatAccountFromForm: () => void;
  startEditWechatAccount: (account: WechatAccount) => void;
  removeWechatAccount: (id: string) => void;
  testWechatAccount: (account: WechatAccount) => void;
  testingWechatAccountId: string | null;
  applyProxyPreset: (preset: "socks5" | "http" | "https" | "clear") => void;
  defaultWechatProxyUrl: string;
  centeredNotice: string | null;
  gitBrowsePrefs: Record<string, GitBrowsePreference>;
  saveGitBrowsePref: (localPath: string, preference: GitBrowsePreference) => void;
  saveGitAuthPref: (localPath: string, auth: GitAuthPreference) => void;
  onGitRepositorySynced: (snapshot: GitRepositorySnapshotPayload) => void;
  onGitRepositoryRemoved: (localPath: string) => void;
}

export default function SettingsDialog({
  open,
  onOpenChange,
  settingsSection,
  setSettingsSection,
  settingsDraft,
  setSettingsDraft,
  settingsIsDirty,
  handleSaveSettings,
  handleSaveSettingsInPlace,
  themeGroups,
  wechatAccountNameInput,
  setWechatAccountNameInput,
  wechatAccountAppIdInput,
  setWechatAccountAppIdInput,
  wechatAccountSecretInput,
  setWechatAccountSecretInput,
  editingWechatAccountId,
  resetWechatAccountForm,
  saveWechatAccountFromForm,
  startEditWechatAccount,
  removeWechatAccount,
  testWechatAccount,
  testingWechatAccountId,
  applyProxyPreset,
  defaultWechatProxyUrl,
  centeredNotice,
  gitBrowsePrefs,
  saveGitBrowsePref,
  saveGitAuthPref,
  onGitRepositorySynced,
  onGitRepositoryRemoved,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const updaterProxyUrl = resolveUpdaterProxyUrl({
    enabled: settingsDraft.proxyEnabled,
    socksProxy: settingsDraft.socksProxy,
    httpProxy: settingsDraft.httpProxy,
    httpsProxy: settingsDraft.httpsProxy,
  });
  const {
    update: _update,
    checking,
    downloading,
    checkError,
    checkUpdate,
  } = useUpdater(updaterProxyUrl ? { proxy: updaterProxyUrl } : undefined);
  const [labTestingConnection, setLabTestingConnection] = useState(false);
  const [labStatusText, setLabStatusText] = useState<string | null>(null);
  const updateToastIdRef = useRef<string | number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const imageHostCardRef = useRef<HTMLDivElement | null>(null);
  const aliyunFieldsRef = useRef<HTMLDivElement | null>(null);
  const aboutVersion = useAboutVersion(open);

  // Git repository management using custom hook
  const git = useGitRepoManager({
    proxyUrl: updaterProxyUrl,
    onGitRepositorySynced,
    onGitRepositoryRemoved,
    saveGitBrowsePref,
    saveGitAuthPref,
    gitBrowsePrefs,
    toasterId: "settings-dialog-center",
  });

  // Compute active upload account
  const activeUploadAccount = settingsDraft.wechatAccounts.find(
    (acc) => acc.id === settingsDraft.defaultWechatAccountId
  );

  useEffect(() => {
    if (!checkError || downloading || !updateToastIdRef.current) return;
    toast.error(t("updater.checkFailed", { error: checkError }), {
      id: updateToastIdRef.current,
      toasterId: SETTINGS_DIALOG_TOASTER_ID,
      duration: 5000,
    });
    updateToastIdRef.current = null;
  }, [checkError, downloading, t]);

  const menus: Array<{
    id: SettingsSection;
    label: string;
    icon: typeof Settings2;
  }> = [
    {
      id: "general",
      label: t("workspace.settingsMenu.general.label"),
      icon: Settings2,
    },
    {
      id: "editor",
      label: t("workspace.settingsMenu.editor.label"),
      icon: SlidersHorizontal,
    },
    {
      id: "theme",
      label: t("workspace.settingsMenu.theme.label"),
      icon: Sparkles,
    },
    {
      id: "publishing",
      label: t("workspace.settingsMenu.publishing.label"),
      icon: Image,
    },
    {
      id: "network",
      label: t("workspace.settingsMenu.network.label"),
      icon: Globe2,
    },
    {
      id: "git",
      label: t("workspace.settingsMenu.git.label"),
      icon: FolderGit2,
    },
    {
      id: "lab",
      label: t("workspace.settingsMenu.lab.label"),
      icon: Sparkles,
    },
    {
      id: "about",
      label: t("workspace.settingsMenu.about.label"),
      icon: Info,
    },
  ];

  const meta: Record<SettingsSection, { title: string }> = {
    general: {
      title: t("workspace.settings.general.title"),
    },
    editor: {
      title: t("workspace.settings.editor.title"),
    },
    theme: {
      title: t("workspace.settings.theme.title"),
    },
    publishing: {
      title: t("workspace.settings.publishing.title"),
    },
    network: {
      title: t("workspace.settings.network.title"),
    },
    git: {
      title: t("workspace.settings.git.title"),
    },
    about: {
      title: t("workspace.settings.about.title"),
    },
    imageHost: {
      title: t("workspace.settings.publishing.title"),
    },
    wechatConfig: {
      title: t("workspace.settings.publishing.title"),
    },
    lab: {
      title: t("workspace.settings.lab.title"),
    },
  };

  const scrollToImageHost = (target: "card" | "fields" = "fields") => {
    const scrollHost = contentRef.current;
    const anchor = target === "card" ? imageHostCardRef.current : aliyunFieldsRef.current;
    if (!scrollHost || !anchor) return;

    requestAnimationFrame(() => {
      const hostRect = scrollHost.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const offset = anchorRect.top - hostRect.top - 24;
      scrollHost.scrollTo({
        top: scrollHost.scrollTop + offset,
        behavior: "smooth",
      });
    });
  };

  const handleSelectImageHostProvider = (provider: ImageHostProvider) => {
    setSettingsDraft((prev) => ({ ...prev, imageHostProvider: provider }));
    if (provider === "aliyun") {
      scrollToImageHost("card");
    }
  };

  useEffect(() => {
    if (settingsSection !== "publishing" || settingsDraft.imageHostProvider !== "aliyun") return;
    scrollToImageHost("fields");
  }, [settingsSection, settingsDraft.imageHostProvider]);

  const openExternalLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch (error) {
      window.open(url, "_blank", "noopener,noreferrer");
      console.error("Failed to open external url in Tauri opener, fallback to window.open", error);
    }
  };

  const handleCheckUpdateFromAbout = async () => {
    const { update, error, errorType } = await checkUpdate();
    if (update) {
      toast.success(t("updater.versionAvailable", { version: update.version }), {
        toasterId: SETTINGS_DIALOG_TOASTER_ID,
      });
      return;
    }
    if (error) {
      toast.error(
        errorType === "plugin-not-found"
          ? t("updater.notAvailableInCurrentRuntime")
          : t("updater.checkFailed", { error }),
        {
          toasterId: SETTINGS_DIALOG_TOASTER_ID,
        }
      );
      return;
    }
    toast.success(t("updater.upToDate"), {
      toasterId: SETTINGS_DIALOG_TOASTER_ID,
    });
  };

  const buildNetworkProxyPayload = () => ({
    enabled: settingsDraft.proxyEnabled,
    socksProxy: settingsDraft.socksProxy.trim(),
    httpProxy: settingsDraft.httpProxy.trim(),
    httpsProxy: settingsDraft.httpsProxy.trim(),
  });

  const resetAiLabConfig = () => {
    setSettingsDraft((prev) => ({
      ...prev,
      aiLabProvider: DEFAULT_AI_LAB_PROVIDER,
      aiLabApiEndpoint: DEFAULT_AI_LAB_ENDPOINT,
      aiLabApiKey: DEFAULT_AI_LAB_API_KEY,
      aiLabModel: DEFAULT_AI_LAB_MODEL,
      aiLabImageSize: DEFAULT_AI_LAB_IMAGE_SIZE,
    }));
    setLabStatusText(t("workspace.settings.lab.resetSuccess"));
  };

  const applyRecommendedLabPreset = () => {
    setSettingsDraft((prev) => ({
      ...prev,
      aiLabProvider: DEFAULT_AI_LAB_PROVIDER,
      aiLabApiEndpoint: DEFAULT_AI_LAB_ENDPOINT,
      aiLabModel: DEFAULT_AI_LAB_MODEL,
      aiLabImageSize: "1888x800",
    }));
    setLabStatusText(t("workspace.settings.lab.applyRecommendedSuccess"));
  };

  const saveAiLabConfig = async () => {
    try {
      await handleSaveSettingsInPlace();
      setLabStatusText(t("workspace.settings.lab.saveSuccess"));
      toast.success(t("workspace.settings.lab.saveSuccess"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`${t("workspace.settings.lab.saveFailed")}: ${message}`);
    }
  };

  const testAiLabConnection = async () => {
    setLabTestingConnection(true);
    setLabStatusText(t("workspace.settings.lab.testingConnection"));
    try {
      await invoke<string>("test_modelscope_connection", {
        request: {
          apiEndpoint: settingsDraft.aiLabApiEndpoint,
          apiKey: settingsDraft.aiLabApiKey,
          networkProxy: buildNetworkProxyPayload(),
        },
      });
      setLabStatusText(t("workspace.settings.lab.connectionReady"));
      toast.success(t("workspace.settings.lab.connectionReady"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLabStatusText(`${t("workspace.settings.lab.connectionFailed")}: ${message}`);
      toast.error(`${t("workspace.settings.lab.connectionFailed")}: ${message}`);
    } finally {
      setLabTestingConnection(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Toaster
        id={SETTINGS_DIALOG_TOASTER_ID}
        position="top-center"
        offset={{ top: "50vh" }}
        toastOptions={{
          classNames: {
            toast:
              "app-toast-surface min-w-[280px] max-w-[420px] rounded-[var(--radius-3xl)] px-4 py-3",
            title: "text-base font-semibold tracking-[-0.01em]",
            description: "text-sm leading-5 text-[var(--app-text-soft)]",
            content: "gap-1.5",
            icon: "mt-0.5",
          },
          style: {
            transform: "translateY(-50%)",
          },
        }}
      />
      <DialogContent className="app-modal-shell !h-[min(760px,calc(100vh-2.5rem))] !w-[min(1080px,calc(100vw-1rem))] !max-w-[1080px] overflow-hidden rounded-[var(--radius-2xl)] p-0">
        <DialogTitle className="sr-only">设置</DialogTitle>
        {centeredNotice && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
            <div className="app-floating-notice rounded-[var(--radius-sm)] px-5 py-3 text-sm font-medium text-[var(--app-accent)]">
              {centeredNotice}
            </div>
          </div>
        )}

        <div className="grid h-full min-h-0 grid-cols-[240px_minmax(0,1fr)] bg-[var(--app-bg-elevated)]">
          <aside className="app-sidebar-shell px-5 py-6">
            <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--app-text)]">
              {t("settings.title")}
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-[var(--app-text-faint)]">
              {t("workspace.settings.sidebarDescription")}
            </p>
            <div className="mt-8 space-y-1.5">
              {menus.map((item) => {
                const Icon = item.icon;
                const active = settingsSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSettingsSection(item.id)}
                    className={`flex w-full items-center justify-start rounded-[var(--radius-md)] px-3 py-3.5 text-left transition ${active ? "bg-[var(--app-selected-surface)] text-[var(--app-text)]" : "text-[var(--app-text-soft)] hover:bg-[var(--app-surface-hover)]"}`}
                  >
                    <div className="flex w-full items-center gap-3">
                      <span className={`${active ? "text-[var(--app-text)]" : "text-[var(--app-text-soft)]"}`}>
                        <Icon size={18} strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium">{item.label}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-[var(--app-bg-elevated)]">
            <div className="border-b border-[var(--app-border)] bg-[var(--app-bg-elevated)] px-8 py-6 backdrop-blur-[8px]">
              <h4 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--app-text)]">
                {meta[settingsSection].title}
              </h4>
            </div>

            <div
              ref={contentRef}
              className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-scroll px-8 py-7 pb-10 pr-5"
            >
              {settingsSection === "general" && (
                <>
                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="text-base font-semibold text-[var(--app-text)]">
                      {t("workspace.settings.general.languageTitle")}
                    </div>
                    <div className="mt-4 max-w-[220px]">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="app-input btn-input flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-4 text-left text-sm font-medium"
                          >
                            <span className="flex items-center gap-2">
                              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--app-accent-soft)] px-2 text-xs font-semibold text-[var(--app-accent)]">
                                {settingsDraft.language.toUpperCase()}
                              </span>
                              <span>
                                {LANGUAGE_OPTIONS.find(
                                  (option) => option.value === settingsDraft.language
                                )?.label ?? t("workspace.settings.general.languageDefaultLabel")}
                              </span>
                            </span>
                            <ChevronDown size={16} className="text-[var(--app-text-soft)]" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          sideOffset={8}
                          className="app-popover-surface w-[220px] rounded-[var(--radius-sm)] p-2"
                        >
                          {LANGUAGE_OPTIONS.map((option) => {
                            const selected = settingsDraft.language === option.value;
                            return (
                              <DropdownMenuItem
                                key={option.value}
                                onSelect={() =>
                                  setSettingsDraft((prev) => ({ ...prev, language: option.value }))
                                }
                                className={`rounded-[var(--radius-sm)] px-3 py-3 text-sm ${selected ? "app-chip-active" : "text-[var(--app-text)]"}`}
                              >
                                <span className="flex w-full items-center justify-between gap-3">
                                  <span className="flex items-center gap-2">
                                    <span
                                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${selected ? "bg-[var(--app-accent)] text-white" : "bg-[var(--app-panel-subtle)] text-[var(--app-text-soft)]"}`}
                                    >
                                      {option.value.toUpperCase()}
                                    </span>
                                    <span>{option.label}</span>
                                  </span>
                                  {selected && <Check size={16} />}
                                </span>
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="text-base font-semibold text-[var(--app-text)]">
                      {t("workspace.settings.general.startupTitle")}
                    </div>
                    <div className="mt-5 space-y-4">
                      <div className="flex items-center justify-between gap-6 rounded-[var(--radius-sm)] bg-[var(--app-panel-subtle)] px-4 py-4">
                        <div>
                          <div className="text-sm font-semibold text-[var(--app-text)]">
                            {t("workspace.settings.general.autoLaunchTitle")}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSettingsDraft((prev) => ({
                              ...prev,
                              autoLaunchEnabled: !prev.autoLaunchEnabled,
                            }))
                          }
                          aria-pressed={settingsDraft.autoLaunchEnabled}
                          className={`${SETTINGS_TOGGLE_BASE} ${settingsDraft.autoLaunchEnabled ? "bg-[var(--app-accent)]" : "app-toggle-off"}`}
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${settingsDraft.autoLaunchEnabled ? "left-6" : "left-1"}`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-6 rounded-[var(--radius-sm)] bg-[var(--app-panel-subtle)] px-4 py-4">
                        <div>
                          <div className="text-sm font-semibold text-[var(--app-text)]">
                            {t("workspace.settings.general.restoreTitle")}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSettingsDraft((prev) => ({
                              ...prev,
                              startupRestoreEnabled: !prev.startupRestoreEnabled,
                            }))
                          }
                          aria-pressed={settingsDraft.startupRestoreEnabled}
                          className={`${SETTINGS_TOGGLE_BASE} ${settingsDraft.startupRestoreEnabled ? "bg-[var(--app-accent)]" : "app-toggle-off"}`}
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${settingsDraft.startupRestoreEnabled ? "left-6" : "left-1"}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {settingsSection === "editor" && (
                <div className={SETTINGS_CARD_CLASS}>
                  <div className="text-base font-semibold text-[var(--app-text)]">
                    {t("workspace.settings.editor.behaviorTitle")}
                  </div>
                  <div className="mt-5 space-y-5">
                    <div>
                      <div className="text-sm font-semibold text-[var(--app-text)]">
                        {t("workspace.settings.editor.defaultDeviceTitle")}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {(["mobile", "tablet", "pc"] as const).map((device) => (
                          <button
                            key={device}
                            onClick={() =>
                              setSettingsDraft((prev) => ({ ...prev, previewDevice: device }))
                            }
                            className={`app-segmented-option ${settingsDraft.previewDevice === device ? "app-segmented-option-active" : ""}`}
                          >
                            {device === "mobile"
                              ? t("workspace.devices.mobile")
                              : device === "tablet"
                                ? t("workspace.devices.tablet")
                                : t("workspace.devices.desktop")}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="app-subtle flex items-center justify-between gap-6 rounded-[var(--radius-lg)] px-4 py-4">
                      <div>
                        <div className="text-sm font-semibold text-[var(--app-text)]">
                          {t("workspace.settings.editor.scrollSyncTitle")}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            scrollSyncEnabled: !prev.scrollSyncEnabled,
                          }))
                        }
                        aria-pressed={settingsDraft.scrollSyncEnabled}
                        className={`${SETTINGS_TOGGLE_BASE} ${settingsDraft.scrollSyncEnabled ? "bg-[var(--app-accent)]" : "app-toggle-off"}`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${settingsDraft.scrollSyncEnabled ? "left-6" : "left-1"}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {settingsSection === "theme" && (
                <>
                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="text-base font-semibold text-[var(--app-text)]">
                      {t("workspace.settings.theme.modeTitle")}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(
                        [
                          { id: "light", label: t("workspace.settings.theme.light") },
                          { id: "dark", label: t("workspace.settings.theme.dark") },
                          { id: "system", label: t("workspace.settings.theme.system") },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          onClick={() =>
                            setSettingsDraft((prev) => ({ ...prev, themeMode: item.id }))
                          }
                          className={`app-segmented-option ${settingsDraft.themeMode === item.id ? "app-segmented-option-active" : ""}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="text-base font-semibold text-[var(--app-text)]">
                      {t("workspace.settings.theme.templateTitle")}
                    </div>
                    <div className="thin-scrollbar mt-5 max-h-[420px] space-y-5 overflow-y-scroll pr-2">
                      {themeGroups.map((group) => (
                        <div key={group.label}>
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-text-faint)]">
                            {group.label}
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-3">
                            {group.themes.map((theme) => {
                              const summary = theme as ThemeSummary;
                              return (
                                <button
                                  key={summary.id}
                                  onClick={() =>
                                    setSettingsDraft((prev) => ({ ...prev, themeId: summary.id }))
                                  }
                                  className={`app-card-interactive rounded-[var(--radius-lg)] px-4 py-4 text-left ${settingsDraft.themeId === summary.id ? "app-card-selected ring-2 ring-[var(--app-accent-soft)]" : ""}`}
                                >
                                  <div className="text-sm font-semibold text-[var(--app-text)]">
                                    {summary.name}
                                  </div>
                                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--app-text-soft)]">
                                    {summary.description}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {settingsSection === "publishing" && (
                <>
                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="text-base font-semibold text-[var(--app-text)]">
                      {t("workspace.settings.publishing.accountsTitle")}
                    </div>
                    <div className="mt-4 space-y-3">
                      {settingsDraft.wechatAccounts.length === 0 && (
                        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-text-soft)]">
                          {t("workspace.settings.publishing.noAccounts")}
                        </div>
                      )}
                      {settingsDraft.wechatAccounts.map((account) => {
                        const isDefault = settingsDraft.defaultWechatAccountId === account.id;
                        const isUpload = settingsDraft.imageHostWechatAccountId === account.id;
                        const isEditing = editingWechatAccountId === account.id;
                        return (
                          <div
                            key={account.id}
                            onClick={() => startEditWechatAccount(account)}
                            className={`app-card-interactive cursor-pointer rounded-[var(--radius-lg)] px-4 py-4 ${isEditing ? "app-card-editing" : isDefault ? "app-card-selected" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold text-[var(--app-text)]">
                                    {account.name}
                                  </div>
                                  {isDefault && (
                                    <span className="app-status-badge bg-[var(--app-accent)] text-white">
                                      {t("workspace.settings.publishing.defaultPublish")}
                                    </span>
                                  )}
                                  {isUpload && (
                                    <span className="app-status-badge bg-[var(--app-accent)] text-white">
                                      {t("workspace.settings.publishing.uploadAccount")}
                                    </span>
                                  )}
                                  {isEditing && (
                                    <span className="app-status-badge app-status-badge-info">
                                      {t("workspace.settings.publishing.editingTag")}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 text-xs text-[var(--app-text-soft)]">
                                  AppID: {account.appId}
                                </div>
                                <div className="mt-2 text-xs text-[var(--app-text-faint)]">
                                  {t("workspace.settings.publishing.editCardHint")}
                                </div>
                              </div>
                              <div
                                className="flex items-center gap-2"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  onClick={() =>
                                    setSettingsDraft((prev) => ({
                                      ...prev,
                                      defaultWechatAccountId: account.id,
                                      imageHostWechatAccountId:
                                        prev.imageHostWechatAccountId || account.id,
                                    }))
                                  }
                                  disabled={isDefault}
                                  className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:cursor-default disabled:opacity-100 ${isDefault ? "bg-[var(--app-accent)] text-white" : "border border-[var(--app-border)] text-[var(--app-text-soft)] dark:border-[var(--app-border-strong)] dark:text-[var(--app-text-soft)]"}`}
                                >
                                  {isDefault
                                    ? t("workspace.settings.publishing.defaultPublish")
                                    : t("workspace.settings.publishing.setDefaultPublish")}
                                </button>
                                <button
                                  onClick={() =>
                                    setSettingsDraft((prev) => ({
                                      ...prev,
                                      imageHostWechatAccountId: account.id,
                                      defaultWechatAccountId:
                                        prev.defaultWechatAccountId || account.id,
                                    }))
                                  }
                                  disabled={isUpload}
                                  className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:cursor-default disabled:opacity-100 ${isUpload ? "bg-[var(--app-accent)] text-white dark:bg-[var(--app-accent)] dark:text-white" : "border border-[var(--app-border)] text-[var(--app-text-soft)] dark:border-[var(--app-border-strong)] dark:text-[var(--app-text-soft)]"}`}
                                >
                                  {isUpload
                                    ? t("workspace.settings.publishing.uploadAccount")
                                    : t("workspace.settings.publishing.setUploadAccount")}
                                </button>
                                <button
                                  onClick={() => testWechatAccount(account)}
                                  disabled={testingWechatAccountId === account.id}
                                  className="rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-70"
                                >
                                  {testingWechatAccountId === account.id
                                    ? t("workspace.settings.publishing.testing")
                                    : t("workspace.settings.publishing.testConnection")}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="text-base font-semibold text-[var(--app-text)]">
                      {editingWechatAccountId
                        ? t("workspace.settings.publishing.editAccountTitle")
                        : t("workspace.settings.publishing.addAccountTitle")}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[var(--app-text-soft)]">
                      {editingWechatAccountId
                        ? t("workspace.settings.publishing.editAccountHint")
                        : t("workspace.settings.publishing.addAccountHint")}
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                          {t("workspace.settings.publishing.accountNameLabel")}
                        </div>
                        <input
                          value={wechatAccountNameInput}
                          onChange={(event) => setWechatAccountNameInput(event.target.value)}
                          placeholder={t("workspace.settings.publishing.accountNamePlaceholder")}
                          className={SETTINGS_INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                          {t("workspace.settings.publishing.appIdLabel")}
                        </div>
                        <input
                          value={wechatAccountAppIdInput}
                          onChange={(event) => setWechatAccountAppIdInput(event.target.value)}
                          placeholder={t("workspace.settings.publishing.appIdPlaceholder")}
                          className={SETTINGS_INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                          {t("workspace.settings.publishing.appSecretLabel")}
                        </div>
                        <input
                          value={wechatAccountSecretInput}
                          onChange={(event) => setWechatAccountSecretInput(event.target.value)}
                          placeholder={t("workspace.settings.publishing.appSecretPlaceholder")}
                          className={SETTINGS_INPUT_CLASS}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={saveWechatAccountFromForm}
                          className="app-btn-primary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm font-medium"
                        >
                          {editingWechatAccountId
                            ? t("workspace.settings.publishing.saveAccount")
                            : t("workspace.settings.publishing.addAccount")}
                        </button>
                        {editingWechatAccountId && (
                          <button
                            onClick={resetWechatAccountForm}
                            className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm"
                          >
                            {t("workspace.settings.publishing.cancelEdit")}
                          </button>
                        )}
                        {editingWechatAccountId && (
                          <button
                            onClick={() => removeWechatAccount(editingWechatAccountId)}
                            className="app-btn-danger btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm"
                          >
                            {t("workspace.settings.publishing.removeAccount")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div ref={imageHostCardRef} className={SETTINGS_CARD_CLASS}>
                    <div className="text-base font-semibold text-[var(--app-text)]">
                      {t("workspace.settings.publishing.imageHostTitle")}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => handleSelectImageHostProvider("wechat")}
                        className={`app-segmented-option ${settingsDraft.imageHostProvider === "wechat" ? "app-segmented-option-active" : ""}`}
                      >
                        {t("workspace.settings.publishing.wechatImageHost")}
                      </button>
                      <button
                        onClick={() => handleSelectImageHostProvider("aliyun")}
                        className={`app-segmented-option ${settingsDraft.imageHostProvider === "aliyun" ? "app-segmented-option-active" : ""}`}
                      >
                        {t("workspace.settings.publishing.aliyunImageHost")}
                      </button>
                    </div>
                    <div className="app-subtle mt-4 rounded-[var(--radius-lg)] px-4 py-4 text-sm text-[var(--app-text-soft)]">
                      <div className="font-semibold text-[var(--app-text)]">
                        {t("workspace.settings.publishing.activeImageHostTitle")}
                      </div>
                      {settingsDraft.imageHostProvider === "wechat" ? (
                        <div className="mt-1 text-xs leading-5 text-[var(--app-text-soft)]">
                          {t("workspace.settings.publishing.wechatImageHost")}
                          {activeUploadAccount
                            ? ` · ${activeUploadAccount.name}（${activeUploadAccount.appId}）`
                            : ` · ${t("workspace.settings.publishing.noUploadAccount")}`}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs leading-5 text-[var(--app-text-soft)]">
                          {t("workspace.settings.publishing.aliyunImageHost")}
                          {settingsDraft.aliyunBucket.trim()
                            ? ` · Bucket: ${settingsDraft.aliyunBucket}`
                            : ` · ${t("workspace.settings.publishing.bucketMissing")}`}
                          {settingsDraft.aliyunRegion.trim()
                            ? ` · Region: ${settingsDraft.aliyunRegion}`
                            : ""}
                        </div>
                      )}
                    </div>
                    {settingsDraft.imageHostProvider === "aliyun" && (
                      <div ref={aliyunFieldsRef} className="mt-4 grid grid-cols-2 gap-3 pb-1">
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                            {t("workspace.settings.publishing.accessKeyIdLabel")}
                          </div>
                          <input
                            value={settingsDraft.aliyunAccessKeyId}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aliyunAccessKeyId: event.target.value,
                              }))
                            }
                            placeholder="AccessKey ID"
                            className={SETTINGS_INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                            {t("workspace.settings.publishing.accessKeySecretLabel")}
                          </div>
                          <input
                            value={settingsDraft.aliyunAccessKeySecret}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aliyunAccessKeySecret: event.target.value,
                              }))
                            }
                            placeholder="AccessKey Secret"
                            className={SETTINGS_INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                            {t("workspace.settings.publishing.bucketLabel")}
                          </div>
                          <input
                            value={settingsDraft.aliyunBucket}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aliyunBucket: event.target.value,
                              }))
                            }
                            placeholder={t("workspace.settings.publishing.bucketPlaceholder")}
                            className={SETTINGS_INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                            {t("workspace.settings.publishing.regionLabel")}
                          </div>
                          <input
                            value={settingsDraft.aliyunRegion}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aliyunRegion: event.target.value,
                              }))
                            }
                            placeholder={t("workspace.settings.publishing.regionPlaceholder")}
                            className={SETTINGS_INPUT_CLASS}
                          />
                        </div>
                        <div className="app-subtle col-span-2 flex items-center justify-between gap-6 rounded-[var(--radius-lg)] px-4 py-4">
                          <div>
                            <div className="text-sm font-semibold text-[var(--app-text)]">
                              {t("workspace.settings.publishing.httpsTitle")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aliyunUseSSL: !prev.aliyunUseSSL,
                              }))
                            }
                            aria-pressed={settingsDraft.aliyunUseSSL}
                            className={`${SETTINGS_TOGGLE_BASE} ${settingsDraft.aliyunUseSSL ? "bg-[var(--app-accent)]" : "app-toggle-off"}`}
                          >
                            <span
                              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${settingsDraft.aliyunUseSSL ? "left-6" : "left-1"}`}
                            />
                          </button>
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                            {t("workspace.settings.publishing.cdnLabel")}
                          </div>
                          <input
                            value={settingsDraft.aliyunCdnDomain}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aliyunCdnDomain: event.target.value,
                              }))
                            }
                            placeholder={t("workspace.settings.publishing.cdnPlaceholder")}
                            className={SETTINGS_INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                            {t("workspace.settings.publishing.pathPrefixLabel")}
                          </div>
                          <input
                            value={settingsDraft.aliyunPathPrefix}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aliyunPathPrefix: event.target.value,
                              }))
                            }
                            placeholder={t("workspace.settings.publishing.pathPrefixPlaceholder")}
                            className={SETTINGS_INPUT_CLASS}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {settingsSection === "network" && (
                <>
                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <div className="text-base font-semibold text-[var(--app-text)]">
                          {t("workspace.settings.network.proxyTitle")}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            proxyEnabled: !prev.proxyEnabled,
                          }))
                        }
                        aria-pressed={settingsDraft.proxyEnabled}
                        className={`${SETTINGS_TOGGLE_BASE} ${settingsDraft.proxyEnabled ? "bg-[var(--app-accent)]" : "app-toggle-off"}`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${settingsDraft.proxyEnabled ? "left-6" : "left-1"}`}
                        />
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => applyProxyPreset("socks5")}
                        className="app-segmented-option"
                      >
                        {t("workspace.settings.network.socksPreset")}
                      </button>
                      <button
                        onClick={() => applyProxyPreset("http")}
                        className="app-segmented-option"
                      >
                        {t("workspace.settings.network.httpPreset")}
                      </button>
                      <button
                        onClick={() => applyProxyPreset("https")}
                        className="app-segmented-option"
                      >
                        {t("workspace.settings.network.httpsPreset")}
                      </button>
                      <button
                        onClick={() => applyProxyPreset("clear")}
                        className="app-segmented-option"
                      >
                        {t("workspace.settings.network.clear")}
                      </button>
                    </div>
                    <div
                      className={`mt-4 grid gap-3 transition-opacity ${settingsDraft.proxyEnabled ? "opacity-100" : "opacity-60"}`}
                    >
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                          {t("workspace.settings.network.socksLabel")}
                        </div>
                        <input
                          value={settingsDraft.socksProxy}
                          onChange={(event) =>
                            setSettingsDraft((prev) => ({ ...prev, socksProxy: event.target.value }))
                          }
                          disabled={!settingsDraft.proxyEnabled}
                          placeholder={t("workspace.settings.network.socksPlaceholder")}
                          className={`${SETTINGS_INPUT_CLASS} app-input-compact`}
                        />
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                          {t("workspace.settings.network.httpLabel")}
                        </div>
                        <input
                          value={settingsDraft.httpProxy}
                          onChange={(event) =>
                            setSettingsDraft((prev) => ({ ...prev, httpProxy: event.target.value }))
                          }
                          disabled={!settingsDraft.proxyEnabled}
                          placeholder={t("workspace.settings.network.httpPlaceholder")}
                          className={`${SETTINGS_INPUT_CLASS} app-input-compact`}
                        />
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                          {t("workspace.settings.network.httpsLabel")}
                        </div>
                        <input
                          value={settingsDraft.httpsProxy}
                          onChange={(event) =>
                            setSettingsDraft((prev) => ({ ...prev, httpsProxy: event.target.value }))
                          }
                          disabled={!settingsDraft.proxyEnabled}
                          placeholder={t("workspace.settings.network.httpsPlaceholder")}
                          className={`${SETTINGS_INPUT_CLASS} app-input-compact`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="text-base font-semibold text-[var(--app-text)]">
                      {t("workspace.settings.network.wechatProxyTitle")}
                    </div>
                    <div className="mt-4 max-w-[720px]">
                      <input
                        value={settingsDraft.wechatProxyUrl}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            wechatProxyUrl: event.target.value,
                          }))
                        }
                        placeholder={defaultWechatProxyUrl}
                        className={SETTINGS_INPUT_CLASS}
                      />
                      <div className="mt-1.5 text-xs text-[var(--app-text-soft)]">
                        <span>{t("workspace.settings.network.wechatProxyTip")}</span> <br/>
                        <a
                          href="https://www.cloudflare.com/zh-cn/ips/"
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 text-[var(--app-accent)] hover:underline"
                        >
                          https://www.cloudflare.com/zh-cn/ips/
                        </a>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {settingsSection === "git" && (
                <>
                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-2xl font-semibold tracking-[-0.02em] text-[var(--app-text)]">
                          {t("workspace.settings.git.contentRepositoriesTitle")}
                        </div>
                      </div>
                      <button
                        onClick={() => void git.refreshAllGitRepositories()}
                        disabled={git.refreshingAllGitRepos}
                        className="app-btn-secondary btn-touchy text-compact inline-flex min-w-[108px] items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-button)] px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RefreshCw
                          size={14}
                          className={`shrink-0 ${git.refreshingAllGitRepos ? "animate-spin" : ""}`}
                        />
                        <span>
                          {git.refreshingAllGitRepos
                            ? t("workspace.settings.git.refreshingAll")
                            : t("workspace.settings.git.refreshAll")}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-[var(--app-text)]">
                          {t("workspace.settings.git.addContentRepositoryTitle")}
                        </div>
                      </div>
                      <div className="app-status-badge app-status-badge-info px-3 py-1 uppercase tracking-[0.14em]">
                        {t("workspace.settings.git.stepLabel", { step: git.gitWizardStep })}
                      </div>
                    </div>
                        <div className="mt-4 flex items-center gap-2">
                          {[1, 2, 3].map((step) => (
                            <button
                              key={step}
                              type="button"
                              onClick={() => git.setGitWizardStep(step)}
                              className={`app-segmented-option btn-touchy min-w-11 text-sm font-semibold ${
                                git.gitWizardStep === step ? "app-segmented-option-active" : ""
                              }`}
                            >
                              {step}
                            </button>
                          ))}
                    </div>

                    {git.gitWizardStep === 1 && (
                      <div className="mt-4 space-y-3">
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                            {t("workspace.settings.git.urlLabel")}
                          </div>
                          <div className="relative">
                            <input
                              value={git.gitRepoUrlInput}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                git.setGitRepoUrlInput(nextValue);
                                if (!git.gitRepoNameInput.trim()) {
                                  git.setGitRepoNameInput(inferRepoNameFromUrl(nextValue));
                                }
                              }}
                              placeholder={t("workspace.settings.git.urlPlaceholder")}
                              className="app-input btn-input pr-11"
                            />
                            {git.checkingGitAccess && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Loader2
                                  size={16}
                                  className="animate-spin text-[var(--app-text-soft)]"
                                />
                              </div>
                            )}
                            {git.gitAccessChecked && !git.checkingGitAccess && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Check size={16} className="text-[var(--app-accent)]" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-[1fr_140px] gap-2">
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                              {t("workspace.settings.git.nameLabel")}
                            </div>
                            <input
                              value={git.gitRepoNameInput}
                              onChange={(event) => git.setGitRepoNameInput(event.target.value)}
                              placeholder={t("workspace.settings.git.namePlaceholder")}
                              className="app-input btn-input"
                            />
                          </div>
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                              {t("workspace.settings.git.branchLabel")}
                            </div>
                            <input
                              value={git.gitRepoBranchInput}
                              onChange={(event) => git.setGitRepoBranchInput(event.target.value)}
                              placeholder={t("workspace.settings.git.branchPlaceholder")}
                              className="app-input btn-input"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-[1fr_1fr] gap-2">
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                              {t("workspace.settings.git.authUserOptionalLabel")}
                            </div>
                            <input
                              value={git.gitRepoUsernameInput}
                              onChange={(event) => git.setGitRepoUsernameInput(event.target.value)}
                              placeholder={t("workspace.settings.git.authUserOptionalPlaceholder")}
                              className="app-input btn-input"
                            />
                          </div>
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                              {t("workspace.settings.git.authTokenOptionalLabel")}
                            </div>
                            <input
                              value={git.gitRepoTokenInput}
                              onChange={(event) => git.setGitRepoTokenInput(event.target.value)}
                              placeholder={t("workspace.settings.git.authTokenOptionalPlaceholder")}
                              className="app-input btn-input"
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void git.inspectGitAccess()}
                            disabled={git.checkingGitAccess}
                            className="app-btn-secondary btn-touchy inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {git.checkingGitAccess ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Check size={14} />
                            )}
                            {t("workspace.settings.git.checkConnection")}
                          </button>
                          {git.gitAccessChecked && (
                            <span className="app-status-badge app-status-badge-success px-3 py-1">
                              {t("workspace.settings.git.connectionVerified")}
                            </span>
                          )}
                        </div>
                        {git.gitBranchOptions.length > 0 && (
                          <div className="app-soft-panel-muted rounded-[var(--radius-lg)] px-4 py-3">
                            <div className="text-sm font-semibold text-[var(--app-text-soft)]">
                              {t("workspace.settings.git.branchPreviewTitle")}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {git.gitBranchOptions.map((branch) => (
                                <button
                                  key={branch}
                                  type="button"
                                  onClick={() => git.setGitRepoBranchInput(branch)}
                                  className={`app-segmented-option min-w-[88px] text-sm ${
                                    git.gitRepoBranchInput === branch
                                      ? "app-segmented-option-active"
                                      : ""
                                  }`}
                                >
                                  {branch}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="app-soft-panel-dashed rounded-[var(--radius-lg)] px-4 py-3 text-sm text-[var(--app-text-soft)]">
                          {t("workspace.settings.git.stepOneHint")}
                        </div>
                      </div>
                    )}

                    {git.gitWizardStep === 2 && (
                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                            {t("workspace.settings.git.contentRootLabel")}
                          </div>
                          <input
                            value={git.gitContentRootInput}
                            onChange={(event) => git.setGitContentRootInput(event.target.value)}
                            placeholder="docs/"
                            className="app-input btn-input"
                          />
                        </div>
                        <div className="grid gap-2 md:grid-cols-3">
                          {[
                            {
                              label: t("workspace.settings.git.scopeMarkdownLabel"),
                              checked: git.gitIncludeMarkdown,
                              onChange: git.setGitIncludeMarkdown,
                            },
                            {
                              label: t("workspace.settings.git.scopeImagesLabel"),
                              checked: git.gitIncludeImages,
                              onChange: git.setGitIncludeImages,
                            },
                            {
                              label: t("workspace.settings.git.scopeExcludeHiddenLabel"),
                              checked: git.gitExcludeHiddenFiles,
                              onChange: git.setGitExcludeHiddenFiles,
                            },
                          ].map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => item.onChange(!item.checked)}
                              className={`app-select-card text-compact ${
                                item.checked ? "app-select-card-active" : ""
                              }`}
                            >
                              <div className="font-semibold">{item.label}</div>
                              <div className="mt-1 text-sm opacity-80">
                                {item.checked
                                  ? t("workspace.settings.git.scopeEnabled")
                                  : t("workspace.settings.git.scopeDisabled")}
                              </div>
                            </button>
                          ))}
                        </div>
                        <div className="app-soft-panel-dashed rounded-[var(--radius-lg)] px-4 py-3 text-sm text-[var(--app-text-soft)]">
                          {t("workspace.settings.git.scopeHint")}
                        </div>
                      </div>
                    )}

                    {git.gitWizardStep === 3 && (
                      <div className="mt-4 space-y-4">
                        <div className="app-soft-panel rounded-[var(--radius-xl)] p-4">
                          <div className="text-base font-semibold text-[var(--app-text)]">
                            {t("workspace.settings.git.reviewTitle")}
                          </div>
                          <div className="text-compact mt-3 space-y-2 text-[var(--app-text-soft)]">
                            <div>
                              {t("workspace.settings.git.reviewRepoUrl", {
                                value: git.gitRepoUrlInput || t("workspace.common.emptyValue"),
                              })}
                            </div>
                            <div>
                              {t("workspace.settings.git.reviewRepoName", {
                                value:
                                  git.gitRepoNameInput ||
                                  inferRepoNameFromUrl(git.gitRepoUrlInput) ||
                                  t("workspace.settings.git.reviewAutoGenerate"),
                              })}
                            </div>
                            <div>
                              {t("workspace.settings.git.reviewBranch", {
                                value:
                                  git.gitRepoBranchInput ||
                                  t("workspace.settings.git.reviewDefaultBranch"),
                              })}
                            </div>
                            <div>
                              {t("workspace.settings.git.reviewContentRoot", {
                                value:
                                  git.gitContentRootInput || t("workspace.settings.git.allContent"),
                              })}
                            </div>
                            <div>
                              {t("workspace.settings.git.reviewStrategy", {
                                value:
                                  [
                                    git.gitIncludeMarkdown
                                      ? t("workspace.settings.git.scopeMarkdownLabel")
                                      : null,
                                    git.gitIncludeImages
                                      ? t("workspace.settings.git.scopeImagesLabel")
                                      : null,
                                    git.gitExcludeHiddenFiles
                                      ? t("workspace.settings.git.scopeExcludeHiddenLabel")
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" / ") ||
                                  t("workspace.settings.git.reviewDefaultStrategy"),
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="app-soft-panel-dashed flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-[var(--app-text-soft)]">
                          <span>{t("workspace.settings.git.reviewFinishHint")}</span>
                          <button
                            onClick={() => void git.syncGitRepository()}
                            disabled={git.syncingGitRepoId === "__new__"}
                            className="btn-touchy text-compact inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] bg-[var(--app-accent)] px-5 font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {git.syncingGitRepoId === "__new__" ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Plus size={14} />
                            )}
                            <span>{t("workspace.settings.git.connectAndSync")}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => git.setGitWizardStep((prev) => Math.max(1, prev - 1))}
                        disabled={git.gitWizardStep === 1}
                        className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("workspace.settings.git.previousStep")}
                      </button>
                      <button
                        type="button"
                        onClick={() => git.setGitWizardStep((prev) => Math.min(3, prev + 1))}
                        disabled={
                          git.gitWizardStep === 3 ||
                          (git.gitWizardStep === 1 &&
                            (!git.gitRepoUrlInput.trim() || !git.gitAccessChecked))
                        }
                        className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("workspace.settings.git.nextStep")}
                      </button>
                    </div>
                  </div>

                  <div className={SETTINGS_CARD_CLASS}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-[var(--app-text)]">
                          {t("workspace.settings.git.repositoryCenterTitle")}
                        </div>
                      </div>
                      <div className="text-sm text-[var(--app-text-soft)]">
                        {t("workspace.settings.git.repositoryCount", {
                          count: git.gitRepositories.length,
                        })}
                      </div>
                    </div>
                    <div className="thin-scrollbar mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                      {git.gitRepositories.map((repository) => (
                        <div
                          key={repository.localPath}
                          className="app-surface-card rounded-[var(--radius-3xl)] p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-md truncate font-semibold text-[var(--app-text)]">
                                  {repository.repoName}
                                </div>
                                <span
                                  className={`app-status-badge uppercase tracking-[0.12em] ${
                                    git.syncingGitRepoId === repository.localPath
                                      ? "app-status-badge-info"
                                      : git.gitRepoErrors[repository.localPath]
                                        ? "app-status-badge-danger"
                                        : "app-status-badge-success"
                                  }`}
                                >
                                  {git.syncingGitRepoId === repository.localPath ? (
                                    <>
                                      <Loader2 size={10} className="animate-spin" />
                                      {t("workspace.settings.git.status.syncing")}
                                    </>
                                  ) : git.gitRepoErrors[repository.localPath] ? (
                                    <>
                                      <AlertCircle size={10} />
                                      {t("workspace.settings.git.status.failed")}
                                    </>
                                  ) : (
                                    <>
                                      <Check size={10} />
                                      {t("workspace.settings.git.status.normal")}
                                    </>
                                  )}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--app-text-soft)]">
                                <span className="inline-flex items-center gap-1">
                                  <GitBranch size={12} />
                                  {repository.branch || "unknown"}
                                </span>
                                <span>·</span>
                                <span>
                                  {git.countContentFiles(repository.folders, repository.files)}{" "}
                                  {t("workspace.settings.git.contentFiles")}
                                </span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock size={12} />
                                  {t("workspace.settings.git.lastSync")}{" "}
                                  {new Date(repository.lastSyncedAt).toLocaleString("zh-CN", {
                                    month: "2-digit",
                                    day: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <div className="mt-2 truncate text-sm text-[var(--app-text-faint)]">
                                {repository.repoUrl}
                              </div>
                              <div className="mt-1 truncate text-xs text-[var(--app-text-faint)]">
                                {t("workspace.settings.git.contentRoot")}
                                {normalizeContentRoot(
                                  gitBrowsePrefs[repository.localPath]?.contentRoot ??
                                    DEFAULT_GIT_BROWSE_PREFERENCE.contentRoot
                                ) || t("workspace.settings.git.allContent")}
                              </div>
                              <div className="mt-1 truncate text-xs text-[var(--app-text-faint)]">
                                {t("workspace.settings.git.localCache")}
                                {repository.localPath}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                onClick={() => onOpenChange(false)}
                                className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm font-medium"
                              >
                                {t("workspace.settings.git.browseContent")}
                              </button>
                              <button
                                onClick={() =>
                                  git.editingGitRepoId === repository.localPath
                                    ? git.setEditingGitRepoId(null)
                                    : git.beginEditGitBrowsePref(repository)
                                }
                                className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm font-medium"
                              >
                                {git.editingGitRepoId === repository.localPath
                                  ? t("workspace.settings.git.collapseStrategy")
                                  : t("workspace.settings.git.editStrategy")}
                              </button>
                              <button
                                onClick={() =>
                                  git.configuringGitRemoteRepoId === repository.localPath
                                    ? git.cancelConfigureGitRemote()
                                    : git.beginConfigureGitRemote(repository)
                                }
                                className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm font-medium"
                              >
                                {git.configuringGitRemoteRepoId === repository.localPath
                                  ? t("workspace.settings.git.collapseRemote")
                                  : t("workspace.settings.git.configureRemote")}
                              </button>
                              <button
                                onClick={() => void git.syncGitRepository(repository)}
                                disabled={git.syncingGitRepoId === repository.localPath}
                                className="btn-touchy inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--app-accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <RefreshCw
                                  size={12}
                                  className={
                                    git.syncingGitRepoId === repository.localPath
                                      ? "animate-spin"
                                      : ""
                                  }
                                />
                                {t("workspace.settings.git.syncNow")}
                              </button>
                              <button
                                onClick={() => void git.removeGitRepository(repository)}
                                disabled={git.deletingGitRepoId === repository.localPath}
                                className="app-btn-danger btn-touchy inline-flex w-11 items-center justify-center rounded-[var(--radius-button)] disabled:cursor-not-allowed disabled:opacity-60"
                                title={t("workspace.settings.git.removeRepository")}
                              >
                                {git.deletingGitRepoId === repository.localPath ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Trash2 size={12} />
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="app-soft-panel-dashed mt-4 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-[var(--app-text-soft)]">
                            {t("workspace.settings.git.contentBrowserNote")}
                          </div>
                          {git.gitRepoErrors[repository.localPath] && (
                            <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--app-danger-border)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm text-[var(--app-danger)]">
                              <div className="font-semibold">
                                {t("workspace.settings.git.syncFailedTitle")}
                              </div>
                              <div className="mt-1 line-clamp-3">
                                {git.gitRepoErrors[repository.localPath]}
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void git.syncGitRepository(repository)}
                                  className="app-btn-primary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-3 text-sm font-semibold text-white"
                                >
                                  {t("workspace.settings.git.retrySync")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    toast.error(git.gitRepoErrors[repository.localPath], {
                                      duration: 7000,
                                      toasterId: SETTINGS_DIALOG_TOASTER_ID,
                                    })
                                  }
                                  className="app-btn-danger btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] bg-transparent px-3 text-sm font-medium"
                                >
                                  {t("workspace.settings.git.viewDetails")}
                                </button>
                              </div>
                            </div>
                          )}
                          {git.editingGitRepoId === repository.localPath && (
                            <div className="app-soft-panel mt-4 rounded-[var(--radius-xl)] p-4">
                              <div className="text-compact font-semibold text-[var(--app-text)]">
                                {t("workspace.settings.git.strategyTitle")}
                              </div>
                              <div className="mt-3 space-y-3">
                                <div>
                                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                                    {t("workspace.settings.git.contentRootLabel")}
                                  </div>
                                  <input
                                    value={git.editingGitContentRoot}
                                    onChange={(event) =>
                                      git.setEditingGitContentRoot(event.target.value)
                                    }
                                    placeholder={t("workspace.settings.git.contentRootPlaceholder")}
                                    className="app-input btn-input"
                                  />
                                </div>
                                <div className="text-xs text-[var(--app-text-soft)]">
                                  {t("workspace.settings.git.contentRootHint")}
                                </div>
                                <div className="grid gap-2 md:grid-cols-3">
                                  {[
                                    {
                                      label: t("workspace.settings.git.includeMarkdown"),
                                      checked: git.editingGitIncludeMarkdown,
                                      onChange: git.setEditingGitIncludeMarkdown,
                                    },
                                    {
                                      label: t("workspace.settings.git.includeImages"),
                                      checked: git.editingGitIncludeImages,
                                      onChange: git.setEditingGitIncludeImages,
                                    },
                                    {
                                      label: t("workspace.settings.git.excludeHidden"),
                                      checked: git.editingGitExcludeHiddenFiles,
                                      onChange: git.setEditingGitExcludeHiddenFiles,
                                    },
                                  ].map((item) => (
                                    <button
                                      key={item.label}
                                      type="button"
                                      onClick={() => item.onChange(!item.checked)}
                                      className={`app-select-card min-h-[72px] px-3 py-3 text-sm ${
                                        item.checked ? "app-select-card-active" : ""
                                      }`}
                                    >
                                      {item.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => git.setEditingGitRepoId(null)}
                                    className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm font-medium"
                                  >
                                    {t("workspace.common.cancel")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => git.saveEditingGitBrowsePref(repository)}
                                    className="btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] bg-[var(--app-accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-hover)]"
                                  >
                                    {t("workspace.settings.git.saveStrategy")}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                          {git.configuringGitRemoteRepoId === repository.localPath && (
                            <div className="app-soft-panel mt-4 rounded-[var(--radius-xl)] p-4">
                              <div className="text-compact font-semibold text-[var(--app-text)]">
                                {t("workspace.settings.git.configureRemoteTitle")}
                              </div>
                              <div className="mt-3 space-y-3">
                                <div>
                                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                                    {t("workspace.settings.git.urlLabel")}
                                  </div>
                                  <input
                                    value={git.configuringGitRemoteUrl}
                                    onChange={(event) =>
                                      git.setConfiguringGitRemoteUrl(event.target.value)
                                    }
                                    placeholder={t("workspace.settings.git.urlPlaceholder")}
                                    className="app-input btn-input"
                                  />
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div>
                                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                                      {t("workspace.settings.git.authUserLabel")}
                                    </div>
                                    <input
                                      value={git.configuringGitRemoteUsername}
                                      onChange={(event) =>
                                        git.setConfiguringGitRemoteUsername(event.target.value)
                                      }
                                      placeholder={t("workspace.settings.git.authUserPlaceholder")}
                                      className="app-input btn-input"
                                    />
                                  </div>
                                  <div>
                                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                                      {t("workspace.settings.git.authTokenLabel")}
                                    </div>
                                    <input
                                      value={git.configuringGitRemoteToken}
                                      onChange={(event) =>
                                        git.setConfiguringGitRemoteToken(event.target.value)
                                      }
                                      placeholder={t("workspace.settings.git.authTokenPlaceholder")}
                                      type="password"
                                      className="app-input btn-input"
                                    />
                                  </div>
                                </div>
                                <div className="text-xs text-[var(--app-text-soft)]">
                                  {t("workspace.settings.git.remoteAuthHint")}
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={git.cancelConfigureGitRemote}
                                    className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm font-medium"
                                  >
                                    {t("workspace.common.cancel")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void git.saveGitRemoteConfiguration(repository)}
                                    disabled={git.savingGitRemoteRepoId === repository.localPath}
                                    className="btn-touchy inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] bg-[var(--app-accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {git.savingGitRemoteRepoId === repository.localPath ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : null}
                                    {t("workspace.settings.git.saveRemote")}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {git.gitRepositories.length === 0 && (
                        <div className="app-soft-panel-dashed rounded-[var(--radius-lg)] px-4 py-4 text-sm text-[var(--app-text-soft)]">
                          {t("workspace.settings.git.repositoryEmptyHint")}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {settingsSection === "lab" && (
                <LabSection
                  settingsDraft={settingsDraft}
                  setSettingsDraft={setSettingsDraft}
                  labTestingConnection={labTestingConnection}
                  labStatusText={labStatusText}
                  applyRecommendedLabPreset={applyRecommendedLabPreset}
                  saveAiLabConfig={saveAiLabConfig}
                  resetAiLabConfig={resetAiLabConfig}
                  testAiLabConnection={testAiLabConnection}
                  t={t}
                />
              )}

              {settingsSection === "about" && (
                <AboutSection
                  aboutVersion={aboutVersion}
                  checking={checking}
                  downloading={downloading}
                  appLogoSrc={appLogo}
                  onCheckUpdate={handleCheckUpdateFromAbout}
                  onOpenChangelog={() => openExternalLink(changelogUrl)}
                  onOpenOfficialSite={() => openExternalLink(officialSiteUrl)}
                  onOpenTerms={() => openExternalLink(termsUrl)}
                  onOpenPrivacy={() => openExternalLink(privacyUrl)}
                  t={t}
                />
              )}
            </div>

            <div className="app-footer-strip flex items-center justify-between gap-3 px-8 py-4">
              <div className="text-xs text-[var(--app-text-soft)]">
                {settingsIsDirty
                  ? t("workspace.settings.pendingChanges")
                  : t("workspace.settings.upToDate")}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onOpenChange(false)}
                  className="app-btn-neutral rounded-[var(--radius-button)] px-6 py-2.5 text-sm font-medium"
                >
                  {t("workspace.common.cancel")}
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={!settingsIsDirty}
                  className="app-btn-primary rounded-[var(--radius-button)] px-6 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("workspace.common.save")}
                </button>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
