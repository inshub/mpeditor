import { Suspense, lazy, useCallback, useEffect, useState, useRef, useMemo } from "react";
import {
  PenLine,
  Eye,
  Sparkles,
  Copy,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle2,
  Loader2,
  Send,
  RefreshCw,
  FolderGit2,
  Save,
  CloudUpload,
  FolderPlus,
  FolderOpen,
  GitBranch,
  ChevronRight,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { isEnabled as isAutoLaunchEnabled } from "@tauri-apps/plugin-autostart";
import { resolveUpdaterProxyUrl } from "./lib/updater";
import { THEMES, THEME_GROUPS } from "./lib/themes";
import { defaultContent } from "./defaultContent";
import {
  DEFAULT_GIT_BROWSE_PREFERENCE,
  getAllowedContentExtensions,
  GitBrowsePreference,
  isHiddenGitName,
  normalizeContentRoot,
} from "./lib/gitContent";
import Toolbar from "./components/Toolbar";
import EditorPanel from "./components/EditorPanel";
import PreviewPanel from "./components/PreviewPanel";
import WorkspaceSidebar from "./components/WorkspaceSidebar";
import { UpdaterDialog } from "./components/updater-dialog";
import { useUpdater } from "./hooks/use-updater";
import { useLocalStoragePersistence } from "./hooks/use-local-storage-persistence";
import { usePreviewRender } from "./hooks/use-preview-render";
import { useScrollSync } from "./hooks/use-scroll-sync";
import { useDebounce } from "./hooks/use-debounce";
import { useSettingsDraftManager } from "./hooks/use-settings-draft-manager";
import { useGitFileActions } from "./hooks/use-git-file-actions";
import { usePublishActions } from "./hooks/use-publish-actions";
import { useCopyActions } from "./hooks/use-copy-actions";
import { useGitSidebarState } from "./hooks/use-git-sidebar-state";
import { useAppUiActions } from "./hooks/use-app-ui-actions";
import { useWorkspaceDocuments } from "./hooks/use-workspace-documents";
import { useWechatAccountManager } from "./hooks/use-wechat-account-manager";
import { useLocalWorkspaceActions } from "./hooks/use-local-workspace-actions";
import { isGitImagePath } from "./lib/git-file";
import { normalizeRelativePath } from "./lib/path";
import type {
  DraftDocument,
  GitAuthPreference,
  GitContentFolderNode,
  GitFileNode,
  GitFolderNode,
  GitRepositorySnapshotPayload,
  WorkspaceState,
} from "./lib/workspace-types";
import { Dialog, DialogContent, DialogTitle } from "./components/ui/dialog";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

type PreviewDevice = "mobile" | "tablet" | "pc";
type ThemeMode = "light" | "dark" | "system";
type WorkspaceSourceMode = "local" | "repository";
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
type LocalLibraryAction = "create" | "open";
type WorkspaceSwitchAction =
  | { type: "createLocal" }
  | { type: "openLocal" }
  | { type: "syncRemote" }
  | { type: "openRecentLocal"; path: string }
  | { type: "openRepository"; localPath: string };
interface WechatAccount {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
}

const SettingsDialog = lazy(() => import("./components/SettingsDialog"));
const CoverGeneratorDialog = lazy(() => import("./components/CoverGeneratorDialog"));

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

interface NetworkProxyPayload {
  enabled: boolean;
  socksProxy: string;
  httpProxy: string;
  httpsProxy: string;
}

interface LocalLibraryDocumentSnapshot {
  filePath: string;
  title: string;
  content: string;
  updatedAt: number;
}

const DEFAULT_WECHAT_PROXY_URL = "https://wechat-proxy.85727637.workers.dev";
const DEFAULT_AI_LAB_PROVIDER: AiLabProvider = "modelscope";
const DEFAULT_AI_LAB_ENDPOINT = "https://api-inference.modelscope.cn/v1";
const DEFAULT_AI_LAB_MODEL = "Tongyi-MAI/Z-Image-Turbo";
const DEFAULT_AI_LAB_API_KEY = "";
const DEFAULT_AI_LAB_IMAGE_SIZE = "1888x800";
const normalizeWechatProxyUrl = (value: string) => value.trim() || DEFAULT_WECHAT_PROXY_URL;
const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const STORAGE_KEYS = {
  workspace: "mpeditor.workspace.v1",
  workspaceCacheMigrationV1: "mpeditor.workspaceCacheMigration.v1",
  activeLocalLibraryPath: "mpeditor.activeLocalLibraryPath.v1",
  recentLocalLibraryPaths: "mpeditor.recentLocalLibraryPaths.v1",
  workspaceSourceMode: "mpeditor.workspaceSourceMode.v1",
  selectedGitRepoLocalPath: "mpeditor.selectedGitRepoLocalPath.v1",
  themeMode: "mpeditor.themeMode.v1",
  activeTheme: "mpeditor.activeTheme.v1",
  previewDevice: "mpeditor.previewDevice.v1",
  scrollSync: "mpeditor.scrollSync.v1",
  defaultTheme: "mpeditor.defaultTheme.v1",
  defaultDevice: "mpeditor.defaultDevice.v1",
  autoLaunch: "mpeditor.autoLaunch.v1",
  startupRestore: "mpeditor.startupRestore.v1",
  language: "mpeditor.language.v1",
  proxyEnabled: "mpeditor.proxyEnabled.v1",
  socksProxy: "mpeditor.socksProxy.v1",
  httpProxy: "mpeditor.httpProxy.v1",
  httpsProxy: "mpeditor.httpsProxy.v1",
  imageHostProvider: "mpeditor.imageHostProvider.v1",
  imageHostWechatAccountId: "mpeditor.imageHostWechatAccountId.v1",
  wechatProxyUrl: "mpeditor.wechatProxyUrl.v1",
  wechatAccounts: "mpeditor.wechatAccounts.v1",
  defaultWechatAccountId: "mpeditor.defaultWechatAccountId.v1",
  gitBrowsePrefs: "mpeditor.gitBrowsePrefs.v1",
  gitAuthPrefs: "mpeditor.gitAuthPrefs.v1",
  wechatImageProxyDomain: "mpeditor.wechatImageProxyDomain.v1",
  wechatAppId: "mpeditor.wechatAppId.v1",
  wechatAppSecret: "mpeditor.wechatAppSecret.v1",
  aliyunAccessKeyId: "mpeditor.aliyunAccessKeyId.v1",
  aliyunAccessKeySecret: "mpeditor.aliyunAccessKeySecret.v1",
  aliyunBucket: "mpeditor.aliyunBucket.v1",
  aliyunRegion: "mpeditor.aliyunRegion.v1",
  aliyunUseSSL: "mpeditor.aliyunUseSSL.v1",
  aliyunCdnDomain: "mpeditor.aliyunCdnDomain.v1",
  aliyunPathPrefix: "mpeditor.aliyunPathPrefix.v1",
  aiLabProvider: "mpeditor.aiLabProvider.v1",
  aiLabApiEndpoint: "mpeditor.aiLabApiEndpoint.v1",
  aiLabApiKey: "mpeditor.aiLabApiKey.v1",
  aiLabModel: "mpeditor.aiLabModel.v1",
  aiLabImageSize: "mpeditor.aiLabImageSize.v1",
  startupEntryCompleted: "mpeditor.startupEntryCompleted.v1",
} as const;

const workspaceStorageKeyForPath = (
  workspaceSourceMode: WorkspaceSourceMode,
  workspacePath: string
) => {
  const normalized = workspacePath.trim();
  const scopedPath = normalized || "__empty__";
  return `${STORAGE_KEYS.workspace}::${workspaceSourceMode}::${scopedPath}`;
};

const createDocument = (title: string, content: string): DraftDocument => ({
  id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  title,
  content,
  updatedAt: Date.now(),
});

const inferTitle = (content: string, fallback = "Untitled Document") => {
  const matched = content
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s*/, "").trim())
    .find((line) => Boolean(line));
  return (matched || fallback).slice(0, 32);
};

const createDefaultDocument = () =>
  createDocument(inferTitle(defaultContent, "New Document"), defaultContent);

const createBlankDocument = (title = "New Document") => createDocument(title, "");

const buildLocalMarkdownFileName = (title: string) => {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const safeBase = base || "new-document";
  return `${safeBase}-${Date.now()}.md`;
};

const getRelativeParentDirectory = (value: string) => {
  const normalized = normalizeRelativePath(value, false).replace(/\/+$/, "");
  if (!normalized || !normalized.includes("/")) return "";
  return normalized.slice(0, normalized.lastIndexOf("/"));
};

const getRelativeLeafName = (value: string) => {
  const normalized = normalizeRelativePath(value, false).replace(/\/+$/, "");
  if (!normalized) return "";
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
};

const isContentFile = (fileName: string, allowedExtensions: Set<string>) => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? allowedExtensions.has(extension) : false;
};

const filterGitContentFiles = (files: GitFileNode[], preference: GitBrowsePreference) => {
  const allowedExtensions = getAllowedContentExtensions(preference);
  const contentRoot = normalizeContentRoot(preference.contentRoot);
  const includePath = (path: string) => !contentRoot || path.startsWith(contentRoot);

  return files.filter((file) => {
    if (preference.excludeHiddenFiles && isHiddenGitName(file.name)) return false;
    if (!includePath(file.path)) return false;
    return isContentFile(file.name, allowedExtensions);
  });
};

const filterGitContentFolders = (
  folders: GitFolderNode[],
  preference: GitBrowsePreference
): GitContentFolderNode[] => {
  const contentRoot = normalizeContentRoot(preference.contentRoot);

  return folders
    .map((folder) => {
      if (preference.excludeHiddenFiles && isHiddenGitName(folder.name)) {
        return null;
      }
      const files = filterGitContentFiles(folder.files, preference);
      const children = filterGitContentFolders(folder.children, preference);
      const folderRelevant =
        !contentRoot ||
        folder.path.startsWith(contentRoot) ||
        contentRoot.startsWith(`${folder.path}/`);
      if (!folderRelevant && files.length === 0 && children.length === 0) {
        return null;
      }
      return {
        name: folder.name,
        path: folder.path,
        files,
        children,
      };
    })
    .filter((folder): folder is GitContentFolderNode => Boolean(folder))
    .filter((folder) => folder.files.length > 0 || folder.children.length > 0);
};

const countGitContentFiles = (folders: GitContentFolderNode[]): number =>
  folders.reduce(
    (total, folder) => total + folder.files.length + countGitContentFiles(folder.children),
    0
  );

const countRepositoryContentFiles = (files: GitFileNode[], folders: GitFolderNode[]): number =>
  filterGitContentFiles(files, DEFAULT_GIT_BROWSE_PREFERENCE).length +
  countGitContentFiles(filterGitContentFolders(folders, DEFAULT_GIT_BROWSE_PREFERENCE));

const filterGitContentFilesByKeyword = (files: GitFileNode[], keyword: string) => {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return files;
  return files.filter(
    (file) =>
      file.name.toLowerCase().includes(normalized) || file.path.toLowerCase().includes(normalized)
  );
};

const filterGitContentFoldersByKeyword = (
  folders: GitContentFolderNode[],
  keyword: string
): GitContentFolderNode[] => {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return folders;

  return folders
    .map((folder) => {
      const selfMatched =
        folder.name.toLowerCase().includes(normalized) ||
        folder.path.toLowerCase().includes(normalized);
      const files = folder.files.filter(
        (file) =>
          file.name.toLowerCase().includes(normalized) ||
          file.path.toLowerCase().includes(normalized)
      );
      const children = filterGitContentFoldersByKeyword(folder.children, normalized);
      if (!selfMatched && files.length === 0 && children.length === 0) return null;
      return { ...folder, files, children };
    })
    .filter((folder): folder is GitContentFolderNode => Boolean(folder));
};

const sanitizeWorkspaceForStorage = (workspace: WorkspaceState): WorkspaceState => ({
  ...workspace,
  documents: workspace.documents.map((doc) => {
    const isLegacyGitImage =
      Boolean(doc.gitSourceKey) &&
      isGitImagePath(doc.gitFilePath) &&
      doc.content.includes("(data:image/");
    if (!isLegacyGitImage || !doc.gitSourceKey || !doc.gitFilePath) {
      return doc;
    }

    // Store raw path info for async conversion during display
    const [localPath] = doc.gitSourceKey.split("::");
    if (!localPath) {
      return doc;
    }

    const separator = localPath.includes("\\") ? "\\" : "/";
    const normalizedLocalPath = localPath.replace(/[\\/]+$/, "");
    const relativeSegments = doc.gitFilePath.split("/").filter(Boolean);
    const absolutePath = [normalizedLocalPath, ...relativeSegments].join(separator);

    return {
      ...doc,
      content: `![${doc.gitFilePath.split("/").pop() || doc.title}](file://${absolutePath.replace(/\\/g, "/")})`,
    };
  }),
});

const getInitialWorkspace = (
  workspaceStorageKey: string = workspaceStorageKeyForPath("local", ""),
  workspaceSourceMode: WorkspaceSourceMode = "local",
  workspacePath = ""
): WorkspaceState => {
  const defaultDoc = createDefaultDocument();
  if (typeof window === "undefined") {
    return { documents: [defaultDoc], activeDocumentId: defaultDoc.id };
  }

  try {
    const startupRestore = readStored<boolean>(STORAGE_KEYS.startupRestore, true);
    if (!startupRestore) {
      return { documents: [defaultDoc], activeDocumentId: defaultDoc.id };
    }
    const raw = localStorage.getItem(workspaceStorageKey);
    if (!raw) return { documents: [defaultDoc], activeDocumentId: defaultDoc.id };

    const parsed = JSON.parse(raw) as WorkspaceState;
    if (!parsed.documents?.length) {
      return { documents: [defaultDoc], activeDocumentId: defaultDoc.id };
    }
    const normalizedWorkspacePath = workspacePath.trim();
    const scopedDocuments =
      workspaceSourceMode === "repository" && normalizedWorkspacePath
        ? parsed.documents.filter((doc) =>
            doc.gitSourceKey?.startsWith(`${normalizedWorkspacePath}::`)
          )
        : parsed.documents;
    if (!scopedDocuments.length) {
      return { documents: [defaultDoc], activeDocumentId: defaultDoc.id };
    }

    const hasActive = scopedDocuments.some((doc) => doc.id === parsed.activeDocumentId);
    return sanitizeWorkspaceForStorage({
      documents: scopedDocuments,
      activeDocumentId: hasActive ? parsed.activeDocumentId : scopedDocuments[0].id,
    });
  } catch {
    return { documents: [defaultDoc], activeDocumentId: defaultDoc.id };
  }
};

const readStored = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

const migrateWorkspaceCacheV1 = () => {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(STORAGE_KEYS.workspaceCacheMigrationV1) === "1") return;

  try {
    // Legacy unscoped workspace key could mix content across projects.
    localStorage.removeItem(STORAGE_KEYS.workspace);

    const repositoryPrefix = `${STORAGE_KEYS.workspace}::repository::`;
    const keysToCheck: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(repositoryPrefix)) continue;
      keysToCheck.push(key);
    }

    for (const key of keysToCheck) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as WorkspaceState;
      if (!parsed.documents?.length) continue;

      const repositoryPath = key.slice(repositoryPrefix.length);
      if (!repositoryPath || repositoryPath === "__empty__") {
        localStorage.removeItem(key);
        continue;
      }

      const scopedDocuments = parsed.documents.filter((doc) =>
        doc.gitSourceKey?.startsWith(`${repositoryPath}::`)
      );
      if (!scopedDocuments.length) {
        localStorage.removeItem(key);
        continue;
      }

      const hasActive = scopedDocuments.some((doc) => doc.id === parsed.activeDocumentId);
      localStorage.setItem(
        key,
        JSON.stringify({
          documents: scopedDocuments,
          activeDocumentId: hasActive ? parsed.activeDocumentId : scopedDocuments[0].id,
        } satisfies WorkspaceState)
      );
    }
  } catch (error) {
    console.error("Failed to migrate workspace cache", error);
  } finally {
    localStorage.setItem(STORAGE_KEYS.workspaceCacheMigrationV1, "1");
  }
};

export default function App() {
  migrateWorkspaceCacheV1();
  const { t, i18n } = useTranslation();
  const newDocumentTitle = t("workspace.sidebar.newDocument");
  const createLocalizedBlankDocument = useCallback(
    () => createBlankDocument(newDocumentTitle),
    [newDocumentTitle]
  );
  const initialLocalLibraryPath = readStored<string>(STORAGE_KEYS.activeLocalLibraryPath, "");
  const initialWorkspaceSourceMode = readStored<WorkspaceSourceMode>(
    STORAGE_KEYS.workspaceSourceMode,
    "local"
  );
  const initialSelectedGitRepoLocalPath = readStored<string>(
    STORAGE_KEYS.selectedGitRepoLocalPath,
    ""
  );
  const [activeLocalLibraryPath, setActiveLocalLibraryPath] = useState(initialLocalLibraryPath);
  const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
    getInitialWorkspace(
      workspaceStorageKeyForPath(
        initialWorkspaceSourceMode,
        initialWorkspaceSourceMode === "repository"
          ? initialSelectedGitRepoLocalPath
          : initialLocalLibraryPath
      ),
      initialWorkspaceSourceMode,
      initialWorkspaceSourceMode === "repository"
        ? initialSelectedGitRepoLocalPath
        : initialLocalLibraryPath
    )
  );
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 768px)").matches
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    readStored<ThemeMode>(STORAGE_KEYS.themeMode, "system")
  );
  const [defaultThemeId, setDefaultThemeId] = useState(() =>
    readStored<string>(STORAGE_KEYS.defaultTheme, THEMES[0].id)
  );
  const [defaultPreviewDevice, setDefaultPreviewDevice] = useState<PreviewDevice>(() =>
    readStored<PreviewDevice>(STORAGE_KEYS.defaultDevice, "pc")
  );
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(() =>
    readStored<boolean>(STORAGE_KEYS.autoLaunch, false)
  );
  const [startupRestoreEnabled, setStartupRestoreEnabled] = useState(() =>
    readStored<boolean>(STORAGE_KEYS.startupRestore, true)
  );
  const [language, setLanguage] = useState<"zh" | "en">(() =>
    readStored<"zh" | "en">(STORAGE_KEYS.language, "zh")
  );
  const [proxyEnabled, setProxyEnabled] = useState(() =>
    readStored<boolean>(STORAGE_KEYS.proxyEnabled, false)
  );
  const [socksProxy, setSocksProxy] = useState(() =>
    readStored<string>(STORAGE_KEYS.socksProxy, "socks5://127.0.0.1:7890")
  );
  const [httpProxy, setHttpProxy] = useState(() => readStored<string>(STORAGE_KEYS.httpProxy, ""));
  const [httpsProxy, setHttpsProxy] = useState(() =>
    readStored<string>(STORAGE_KEYS.httpsProxy, "")
  );
  const [imageHostProvider, setImageHostProvider] = useState<ImageHostProvider>(() =>
    readStored<ImageHostProvider>(STORAGE_KEYS.imageHostProvider, "wechat")
  );
  const [imageHostWechatAccountId, setImageHostWechatAccountId] = useState(() =>
    readStored<string>(STORAGE_KEYS.imageHostWechatAccountId, "")
  );
  const [wechatProxyUrl, setWechatProxyUrl] = useState(() =>
    readStored<string>(
      STORAGE_KEYS.wechatProxyUrl,
      readStored<string>(STORAGE_KEYS.wechatImageProxyDomain, DEFAULT_WECHAT_PROXY_URL)
    )
  );
  const [wechatAccounts, setWechatAccounts] = useState<WechatAccount[]>(() => {
    const saved = readStored<WechatAccount[]>(STORAGE_KEYS.wechatAccounts, []);
    if (saved.length > 0) return saved;
    const legacyAppId = readStored<string>(STORAGE_KEYS.wechatAppId, "");
    const legacyAppSecret = readStored<string>(STORAGE_KEYS.wechatAppSecret, "");
    if (!legacyAppId || !legacyAppSecret) return [];
    return [
      {
        id: `wx_${Date.now().toString(36)}`,
        name: "Default Account",
        appId: legacyAppId,
        appSecret: legacyAppSecret,
      },
    ];
  });
  const [defaultWechatAccountId, setDefaultWechatAccountId] = useState(() => {
    const saved = readStored<string>(STORAGE_KEYS.defaultWechatAccountId, "");
    if (saved) return saved;
    const first = readStored<WechatAccount[]>(STORAGE_KEYS.wechatAccounts, [])[0];
    return first?.id ?? "";
  });
  const [aliyunAccessKeyId, setAliyunAccessKeyId] = useState(() =>
    readStored<string>(STORAGE_KEYS.aliyunAccessKeyId, "")
  );
  const [aliyunAccessKeySecret, setAliyunAccessKeySecret] = useState(() =>
    readStored<string>(STORAGE_KEYS.aliyunAccessKeySecret, "")
  );
  const [aliyunBucket, setAliyunBucket] = useState(() =>
    readStored<string>(STORAGE_KEYS.aliyunBucket, "")
  );
  const [aliyunRegion, setAliyunRegion] = useState(() =>
    readStored<string>(STORAGE_KEYS.aliyunRegion, "")
  );
  const [aliyunUseSSL, setAliyunUseSSL] = useState(() =>
    readStored<boolean>(STORAGE_KEYS.aliyunUseSSL, true)
  );
  const [aliyunCdnDomain, setAliyunCdnDomain] = useState(() =>
    readStored<string>(STORAGE_KEYS.aliyunCdnDomain, "")
  );
  const [aliyunPathPrefix, setAliyunPathPrefix] = useState(() =>
    readStored<string>(STORAGE_KEYS.aliyunPathPrefix, "")
  );
  const [aiLabProvider, setAiLabProvider] = useState<AiLabProvider>(() =>
    readStored<AiLabProvider>(STORAGE_KEYS.aiLabProvider, DEFAULT_AI_LAB_PROVIDER)
  );
  const [aiLabApiEndpoint, setAiLabApiEndpoint] = useState(() =>
    readStored<string>(STORAGE_KEYS.aiLabApiEndpoint, DEFAULT_AI_LAB_ENDPOINT)
  );
  const [aiLabApiKey, setAiLabApiKey] = useState(() =>
    readStored<string>(STORAGE_KEYS.aiLabApiKey, DEFAULT_AI_LAB_API_KEY)
  );
  const [aiLabModel, setAiLabModel] = useState(() =>
    readStored<string>(STORAGE_KEYS.aiLabModel, DEFAULT_AI_LAB_MODEL)
  );
  const [aiLabImageSize, setAiLabImageSize] = useState(() =>
    readStored<string>(STORAGE_KEYS.aiLabImageSize, DEFAULT_AI_LAB_IMAGE_SIZE)
  );
  const [activeTheme, setActiveTheme] = useState(() =>
    readStored<string>(
      STORAGE_KEYS.activeTheme,
      readStored<string>(STORAGE_KEYS.defaultTheme, THEMES[0].id)
    )
  );
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>(() =>
    readStored<PreviewDevice>(
      STORAGE_KEYS.previewDevice,
      readStored<PreviewDevice>(STORAGE_KEYS.defaultDevice, "pc")
    )
  );
  const [activePanel, setActivePanel] = useState<"editor" | "preview">("editor");
  const [scrollSyncEnabled, setScrollSyncEnabled] = useState(() =>
    readStored<boolean>(STORAGE_KEYS.scrollSync, true)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coverGeneratorOpen, setCoverGeneratorOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>({
    themeMode,
    language,
    autoLaunchEnabled,
    startupRestoreEnabled,
    proxyEnabled,
    socksProxy,
    httpProxy,
    httpsProxy,
    themeId: activeTheme,
    previewDevice,
    scrollSyncEnabled,
    imageHostProvider,
    imageHostWechatAccountId,
    wechatProxyUrl,
    wechatAccounts,
    defaultWechatAccountId,
    aliyunAccessKeyId,
    aliyunAccessKeySecret,
    aliyunBucket,
    aliyunRegion,
    aliyunUseSSL,
    aliyunCdnDomain,
    aliyunPathPrefix,
    aiLabProvider,
    aiLabApiEndpoint,
    aiLabApiKey,
    aiLabModel,
    aiLabImageSize,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [documentSearch, setDocumentSearch] = useState("");
  const [workspaceSourceMode, setWorkspaceSourceMode] = useState<WorkspaceSourceMode>(
    initialWorkspaceSourceMode
  );
  const [persistedSelectedGitRepoLocalPath, setPersistedSelectedGitRepoLocalPath] = useState(() =>
    initialSelectedGitRepoLocalPath
  );
  const [showStartupEntry, setShowStartupEntry] = useState(
    () => !readStored<boolean>(STORAGE_KEYS.startupEntryCompleted, false)
  );
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const [pendingWorkspaceSwitchAction, setPendingWorkspaceSwitchAction] =
    useState<WorkspaceSwitchAction | null>(null);
  const [localLibraryAction, setLocalLibraryAction] = useState<LocalLibraryAction | null>(null);
  const [startupEntryFocusIndex, setStartupEntryFocusIndex] = useState(0);
  const [gitRepositories, setGitRepositories] = useState<GitRepositorySnapshotPayload[]>([]);
  const [recentLocalLibraryPaths, setRecentLocalLibraryPaths] = useState<string[]>(() =>
    readStored<string[]>(STORAGE_KEYS.recentLocalLibraryPaths, [])
  );
  const [draftsExpanded, setDraftsExpanded] = useState(true);
  const [gitBrowsePrefs, setGitBrowsePrefs] = useState<Record<string, GitBrowsePreference>>(() =>
    readStored<Record<string, GitBrowsePreference>>(STORAGE_KEYS.gitBrowsePrefs, {})
  );
  const [gitAuthPrefs, setGitAuthPrefs] = useState<Record<string, GitAuthPreference>>(() =>
    readStored<Record<string, GitAuthPreference>>(STORAGE_KEYS.gitAuthPrefs, {})
  );
  const [settingsCenteredNotice, setSettingsCenteredNotice] = useState<string | null>(null);
  const [isSyncingWorkspace, setIsSyncingWorkspace] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const activeDocument =
    workspace.documents.find((doc) => doc.id === workspace.activeDocumentId) ??
    workspace.documents[0];
  const markdownInput = activeDocument?.content ?? "";
  const debouncedMarkdownInput = useDebounce(markdownInput, 500);
  const hasPendingEditorInput = markdownInput !== debouncedMarkdownInput;
  const previewThemeId = settingsOpen ? settingsDraft.themeId : activeTheme;
  const effectiveThemeMode = settingsOpen ? settingsDraft.themeMode : themeMode;
  const renderedHtml = usePreviewRender(markdownInput, previewThemeId);
  const {
    editorScrollRef,
    previewOuterScrollRef,
    previewInnerScrollRef,
    handleEditorScroll,
    handlePreviewOuterScroll,
    handlePreviewInnerScroll,
  } = useScrollSync({ scrollSyncEnabled, previewDevice, renderedHtml });
  const { copied, isCopying, handleCopy } = useCopyActions({
    t,
    isTauriRuntime,
    previewRef,
    renderedHtml,
    previewThemeId,
  });
  const buildWechatProxyDomain = (proxyUrl = wechatProxyUrl) => normalizeWechatProxyUrl(proxyUrl);
  const {
    deleteConfirmDocumentId,
    setDeleteConfirmDocumentId,
    updateActiveDocument,
    handleSwitchDocument,
    handleDeleteDocument,
    confirmDeleteDocument: confirmDeleteDocumentInWorkspace,
    deleteConfirmDocument,
  } = useWorkspaceDocuments({
    workspace,
    setWorkspace,
    inferTitle,
    createBlankDocument: createLocalizedBlankDocument,
    createDocument,
    duplicateSuffix: t("workspace.documentActions.duplicateSuffix"),
    onSwitchToEditor: () => setActivePanel("editor"),
  });
  const {
    editingWechatAccountId,
    testingWechatAccountId,
    wechatAccountNameInput,
    wechatAccountAppIdInput,
    wechatAccountSecretInput,
    setWechatAccountNameInput,
    setWechatAccountAppIdInput,
    setWechatAccountSecretInput,
    resetWechatAccountForm,
    startEditWechatAccount,
    saveWechatAccountFromForm,
    removeWechatAccount,
    testWechatAccount,
  } = useWechatAccountManager({
    settingsDraft,
    setSettingsDraft,
    setCenteredNotice: setSettingsCenteredNotice,
    buildWechatProxyDomain,
  });
  const { settingsIsDirty, handleSaveSettings, handleSaveSettingsInPlace } =
    useSettingsDraftManager({
      t,
      isTauriRuntime,
      settingsOpen,
      setSettingsOpen,
      settingsDraft,
      setSettingsDraft,
      resetWechatAccountForm,
      normalizeWechatProxyUrl,
      defaultAiLabImageSize: DEFAULT_AI_LAB_IMAGE_SIZE,
      source: {
        themeMode,
        language,
        autoLaunchEnabled,
        startupRestoreEnabled,
        proxyEnabled,
        socksProxy,
        httpProxy,
        httpsProxy,
        themeId: activeTheme,
        previewDevice,
        scrollSyncEnabled,
        imageHostProvider,
        imageHostWechatAccountId,
        wechatProxyUrl,
        wechatAccounts,
        defaultWechatAccountId,
        aliyunAccessKeyId,
        aliyunAccessKeySecret,
        aliyunBucket,
        aliyunRegion,
        aliyunUseSSL,
        aliyunCdnDomain,
        aliyunPathPrefix,
        aiLabProvider,
        aiLabApiEndpoint,
        aiLabApiKey,
        aiLabModel,
        aiLabImageSize,
      },
      setters: {
        setAutoLaunchEnabled,
        setThemeMode,
        setLanguage,
        setStartupRestoreEnabled,
        setProxyEnabled,
        setSocksProxy,
        setHttpProxy,
        setHttpsProxy,
        setActiveTheme,
        setDefaultThemeId,
        setPreviewDevice,
        setDefaultPreviewDevice,
        setScrollSyncEnabled,
        setImageHostProvider,
        setImageHostWechatAccountId,
        setWechatProxyUrl,
        setWechatAccounts,
        setDefaultWechatAccountId,
        setAliyunAccessKeyId,
        setAliyunAccessKeySecret,
        setAliyunBucket,
        setAliyunRegion,
        setAliyunUseSSL,
        setAliyunCdnDomain,
        setAliyunPathPrefix,
        setAiLabProvider,
        setAiLabApiEndpoint,
        setAiLabApiKey,
        setAiLabModel,
        setAiLabImageSize,
      },
    });
  const workspaceStorageKey = useMemo(() => {
    const currentWorkspacePath =
      workspaceSourceMode === "repository"
        ? persistedSelectedGitRepoLocalPath
        : activeLocalLibraryPath;
    return workspaceStorageKeyForPath(workspaceSourceMode, currentWorkspacePath);
  }, [workspaceSourceMode, persistedSelectedGitRepoLocalPath, activeLocalLibraryPath]);
  const persistedWorkspace = useMemo(() => sanitizeWorkspaceForStorage(workspace), [workspace]);
  const persistedEntries = useMemo(
    () => [
      { key: workspaceStorageKey, value: persistedWorkspace },
      { key: STORAGE_KEYS.activeLocalLibraryPath, value: activeLocalLibraryPath },
      { key: STORAGE_KEYS.recentLocalLibraryPaths, value: recentLocalLibraryPaths },
      { key: STORAGE_KEYS.workspaceSourceMode, value: workspaceSourceMode },
      { key: STORAGE_KEYS.selectedGitRepoLocalPath, value: persistedSelectedGitRepoLocalPath },
      { key: STORAGE_KEYS.themeMode, value: themeMode },
      { key: STORAGE_KEYS.activeTheme, value: activeTheme },
      { key: STORAGE_KEYS.previewDevice, value: previewDevice },
      { key: STORAGE_KEYS.scrollSync, value: scrollSyncEnabled },
      { key: STORAGE_KEYS.defaultTheme, value: defaultThemeId },
      { key: STORAGE_KEYS.defaultDevice, value: defaultPreviewDevice },
      { key: STORAGE_KEYS.autoLaunch, value: autoLaunchEnabled },
      { key: STORAGE_KEYS.startupRestore, value: startupRestoreEnabled },
      { key: STORAGE_KEYS.language, value: language },
      { key: STORAGE_KEYS.proxyEnabled, value: proxyEnabled },
      { key: STORAGE_KEYS.socksProxy, value: socksProxy },
      { key: STORAGE_KEYS.httpProxy, value: httpProxy },
      { key: STORAGE_KEYS.httpsProxy, value: httpsProxy },
      { key: STORAGE_KEYS.imageHostProvider, value: imageHostProvider },
      { key: STORAGE_KEYS.imageHostWechatAccountId, value: imageHostWechatAccountId },
      { key: STORAGE_KEYS.wechatProxyUrl, value: wechatProxyUrl },
      { key: STORAGE_KEYS.wechatAccounts, value: wechatAccounts },
      { key: STORAGE_KEYS.defaultWechatAccountId, value: defaultWechatAccountId },
      { key: STORAGE_KEYS.aliyunAccessKeyId, value: aliyunAccessKeyId },
      { key: STORAGE_KEYS.aliyunAccessKeySecret, value: aliyunAccessKeySecret },
      { key: STORAGE_KEYS.aliyunBucket, value: aliyunBucket },
      { key: STORAGE_KEYS.aliyunRegion, value: aliyunRegion },
      { key: STORAGE_KEYS.aliyunUseSSL, value: aliyunUseSSL },
      { key: STORAGE_KEYS.aliyunCdnDomain, value: aliyunCdnDomain },
      { key: STORAGE_KEYS.aliyunPathPrefix, value: aliyunPathPrefix },
      { key: STORAGE_KEYS.aiLabProvider, value: aiLabProvider },
      { key: STORAGE_KEYS.aiLabApiEndpoint, value: aiLabApiEndpoint },
      { key: STORAGE_KEYS.aiLabApiKey, value: aiLabApiKey },
      { key: STORAGE_KEYS.aiLabModel, value: aiLabModel },
      { key: STORAGE_KEYS.aiLabImageSize, value: aiLabImageSize },
      { key: STORAGE_KEYS.gitBrowsePrefs, value: gitBrowsePrefs },
      { key: STORAGE_KEYS.gitAuthPrefs, value: gitAuthPrefs },
    ],
    [
      persistedWorkspace,
      workspaceStorageKey,
      activeLocalLibraryPath,
      recentLocalLibraryPaths,
      workspaceSourceMode,
      persistedSelectedGitRepoLocalPath,
      themeMode,
      activeTheme,
      previewDevice,
      scrollSyncEnabled,
      defaultThemeId,
      defaultPreviewDevice,
      autoLaunchEnabled,
      startupRestoreEnabled,
      language,
      proxyEnabled,
      socksProxy,
      httpProxy,
      httpsProxy,
      imageHostProvider,
      imageHostWechatAccountId,
      wechatProxyUrl,
      wechatAccounts,
      defaultWechatAccountId,
      aliyunAccessKeyId,
      aliyunAccessKeySecret,
      aliyunBucket,
      aliyunRegion,
      aliyunUseSSL,
      aliyunCdnDomain,
      aliyunPathPrefix,
      aiLabProvider,
      aiLabApiEndpoint,
      aiLabApiKey,
      aiLabModel,
      aiLabImageSize,
      gitBrowsePrefs,
      gitAuthPrefs,
    ]
  );

  useLocalStoragePersistence(persistedEntries, 800);

  useEffect(() => {
    const applyThemeClass = (mode: ThemeMode) => {
      if (mode === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
        return;
      }
      if (mode === "dark") document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };

    applyThemeClass(effectiveThemeMode);
    if (effectiveThemeMode !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyThemeClass("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [effectiveThemeMode]);

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [i18n, language]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const syncViewport = () => setIsDesktop(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isTauriRuntime()) return;

    isAutoLaunchEnabled()
      .then((enabled) => {
        if (cancelled) return;
        setAutoLaunchEnabled(enabled);
      })
      .catch((error) => {
        console.error("Failed to read autostart status", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!wechatAccounts.length) {
      if (defaultWechatAccountId) setDefaultWechatAccountId("");
      if (imageHostWechatAccountId) setImageHostWechatAccountId("");
      return;
    }

    const hasDefault = wechatAccounts.some((account) => account.id === defaultWechatAccountId);
    const firstId = wechatAccounts[0].id;
    if (!hasDefault) {
      setDefaultWechatAccountId(firstId);
    }

    const hasImageHostAccount = wechatAccounts.some(
      (account) => account.id === imageHostWechatAccountId
    );
    if (!hasImageHostAccount) {
      setImageHostWechatAccountId(hasDefault ? defaultWechatAccountId || firstId : firstId);
    }
  }, [wechatAccounts, defaultWechatAccountId, imageHostWechatAccountId]);

  const isMacDesktop =
    typeof navigator !== "undefined" && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform);

  const buildNetworkProxyPayload = (): NetworkProxyPayload => ({
    enabled: proxyEnabled,
    socksProxy: socksProxy.trim(),
    httpProxy: httpProxy.trim(),
    httpsProxy: httpsProxy.trim(),
  });
  const networkProxyPayload = buildNetworkProxyPayload();
  const { isPublishingDraft, uploadClipboardImage, handlePublishToDraft } = usePublishActions({
    t,
    isTauriRuntime,
    renderedHtml,
    previewThemeId,
    activeDocumentTitle: activeDocument?.title || t("workspace.sidebar.untitled"),
    networkProxy: networkProxyPayload,
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
  });
  const updaterProxyUrl = resolveUpdaterProxyUrl(networkProxyPayload);
  const updaterOptions = useMemo(
    () => (updaterProxyUrl ? { proxy: updaterProxyUrl } : undefined),
    [updaterProxyUrl]
  );

  const {
    update: pendingUpdate,
    checking: updateChecking,
    downloading: updateDownloading,
    progress: updateProgress,
    checkError: updateCheckError,
    checkUpdate: updaterCheckUpdate,
    installUpdate: updaterInstallUpdate,
  } = useUpdater(updaterOptions);

  const deviceWidthClass = () => {
    if (previewDevice === "mobile") return "w-[520px] max-w-full";
    if (previewDevice === "tablet") return "w-[800px] max-w-full";
    return "w-[840px] xl:w-[1024px] max-w-[95%]";
  };

  const activeThemeName =
    THEMES.find((theme) => theme.id === previewThemeId)?.name ?? t("workspace.footer.defaultTheme");
  const primaryToolbarButtonClass =
    "flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-3.5 text-xs font-medium";
  const normalizedSearch = documentSearch.trim().toLowerCase();
  const filteredDocuments = workspace.documents
    .filter((doc) => {
      if (!normalizedSearch) return true;
      return (
        doc.title.toLowerCase().includes(normalizedSearch) ||
        doc.localFilePath?.toLowerCase().includes(normalizedSearch)
      );
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const {
    setSelectedRepoLocalPath,
    selectedRepoLocalPath,
    gitRepositoriesWithContent,
    selectedGitRepositoryEntry,
    visibleGitContentFiles,
    visibleGitContentFolders,
    isGitFolderExpanded,
    toggleGitFolderExpanded,
  } = useGitSidebarState({
    gitRepositories,
    initialSelectedRepoLocalPath: persistedSelectedGitRepoLocalPath,
    normalizedSearch,
    gitBrowsePrefs,
    defaultBrowsePreference: DEFAULT_GIT_BROWSE_PREFERENCE,
    filterGitContentFiles,
    filterGitContentFolders,
    countRepositoryContentFiles,
    filterGitContentFilesByKeyword,
    filterGitContentFoldersByKeyword,
  });

  useEffect(() => {
    const normalizedRepoPath = selectedRepoLocalPath.trim();
    if (workspaceSourceMode !== "repository") {
      setPersistedSelectedGitRepoLocalPath(normalizedRepoPath);
      return;
    }
    if (!normalizedRepoPath || normalizedRepoPath === persistedSelectedGitRepoLocalPath) {
      setPersistedSelectedGitRepoLocalPath(normalizedRepoPath);
      return;
    }
    if (hasPendingEditorInput) {
      setSelectedRepoLocalPath(persistedSelectedGitRepoLocalPath);
      return;
    }
    const nextWorkspaceKey = workspaceStorageKeyForPath("repository", normalizedRepoPath);
    const matchedRepository = gitRepositories.find(
      (repository) => repository.localPath === normalizedRepoPath
    );
    const repositoryHasContent = matchedRepository
      ? countRepositoryContentFiles(matchedRepository.files, matchedRepository.folders) > 0
      : true;
    setPersistedSelectedGitRepoLocalPath(normalizedRepoPath);
    if (!repositoryHasContent) {
      const fallback = createLocalizedBlankDocument();
      setWorkspace({ documents: [fallback], activeDocumentId: fallback.id });
      return;
    }
    setWorkspace(getInitialWorkspace(nextWorkspaceKey, "repository", normalizedRepoPath));
  }, [
    selectedRepoLocalPath,
    workspaceSourceMode,
    persistedSelectedGitRepoLocalPath,
    hasPendingEditorInput,
    gitRepositories,
    countRepositoryContentFiles,
    createLocalizedBlankDocument,
    setSelectedRepoLocalPath,
    setWorkspace,
  ]);

  const refreshGitRepositories = useCallback(
    async (_localPath: string) => {
      if (!isTauriRuntime()) return;
      try {
        const repositories = await invoke<
          {
            repoUrl: string;
            repoName: string;
            branch: string;
            localPath: string;
            isEmpty: boolean;
            files: GitFileNode[];
            folders: GitFolderNode[];
            lastSyncedAt: number;
          }[]
        >("list_synced_git_repositories");
        setGitRepositories(repositories);
      } catch (error) {
        console.error("Failed to refresh git repositories", error);
      }
    },
    [setGitRepositories]
  );
  useEffect(() => {
    void refreshGitRepositories("");
  }, [refreshGitRepositories]);
  const upsertGitRepository = useCallback((snapshot: GitRepositorySnapshotPayload) => {
    setGitRepositories((prev) => {
      const existing = prev.findIndex((repo) => repo.localPath === snapshot.localPath);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = snapshot;
        return updated;
      }
      return [...prev, snapshot];
    });
  }, []);
  const removeGitRepository = useCallback((localPath: string) => {
    setGitRepositories((prev) => prev.filter((repo) => repo.localPath !== localPath));
  }, []);
  const activeGitSourceDocument = activeDocument?.gitSourceKey ? activeDocument : null;
  const activeGitLocalPath = activeGitSourceDocument?.gitSourceKey?.split("::")[0] ?? "";
  const activeGitIsImage = isGitImagePath(activeGitSourceDocument?.gitFilePath);

  useEffect(() => {
    if (!activeDocument) return;

    if (activeDocument.gitSourceKey) {
      if (workspaceSourceMode !== "repository") {
        setWorkspaceSourceMode("repository");
      }
      return;
    }

    if (activeDocument.localFilePath && workspaceSourceMode !== "local") {
      setWorkspaceSourceMode("local");
    }
  }, [
    activeDocument,
    workspaceSourceMode,
  ]);

  const {
    isSavingGitFile,
    isPushingGitFile,
    newGitFileDialogOpen,
    newGitFileTarget,
    newGitFilePathInput,
    isCreatingGitFile,
    newGitFolderDialogOpen,
    newGitFolderTarget,
    newGitFolderPathInput,
    isCreatingGitFolder,
    gitEntryActionDialogOpen,
    gitPathActionMode,
    gitEntryActionTarget,
    gitEntryActionInput,
    isApplyingGitEntryAction,
    gitDeleteConfirmOpen,
    gitDeleteTarget,
    isDeletingGitEntry,
    setNewGitFileDialogOpen,
    setNewGitFilePathInput,
    setNewGitFolderDialogOpen,
    setNewGitFolderPathInput,
    setGitEntryActionInput,
    setGitEntryActionDialogOpen,
    handleSaveActiveGitFile,
    handleCommitAndPushActiveGitFile,
    handleCreateGitFile,
    handleCreateGitFolder,
    handleGitFileClick,
    handleOpenCreateGitFileDialog,
    handleOpenCreateGitFolderDialog,
    closeNewGitFileDialog,
    closeNewGitFolderDialog,
    closeGitEntryActionDialog,
    openRenameGitEntryDialog,
    moveGitEntryToDirectory,
    applyGitEntryPathAction,
    requestDeleteGitEntry,
    cancelDeleteGitEntry,
    confirmDeleteGitEntry,
  } = useGitFileActions({
    t,
    activeGitSourceDocument,
    activeGitLocalPath,
    activeGitIsImage,
    gitAuthPrefs,
    workspaceDocuments: workspace.documents,
    setWorkspace,
    setActivePanel,
    isGitImagePath,
    refreshGitRepositories,
  });
  const { applyProxyPreset, openSettings, insertCoverIntoCurrentDocument } = useAppUiActions({
    t,
    markdownInput,
    setSettingsDraft,
    setSettingsSection,
    setSettingsOpen,
    updateActiveDocument,
    setCoverGeneratorOpen,
  });
  const currentProjectName = useMemo(() => {
    if (workspaceSourceMode === "repository") {
      return (
        selectedGitRepositoryEntry?.repository.repoName ?? t("workspace.sidebar.contentRepository")
      );
    }
    const normalized = activeLocalLibraryPath.trim().replace(/[\\/]+$/, "");
    if (!normalized) return t("workspace.sidebar.localLibrary");
    const segments = normalized.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] || t("workspace.sidebar.localLibrary");
  }, [
    workspaceSourceMode,
    selectedGitRepositoryEntry?.repository.repoName,
    activeLocalLibraryPath,
    t,
  ]);
  const activeWorkspaceRootPath = useMemo(() => {
    if (workspaceSourceMode === "repository") {
      return selectedGitRepositoryEntry?.repository.localPath?.trim() ?? "";
    }
    return activeLocalLibraryPath.trim();
  }, [
    workspaceSourceMode,
    selectedGitRepositoryEntry?.repository.localPath,
    activeLocalLibraryPath,
  ]);
  const {
    localWorkspaceTree,
    refreshLocalWorkspaceTree,
    saveLocalLibraryDocument,
    deleteLocalFileAndRefresh,
    moveDocumentDialogOpen,
    moveDocumentMode,
    moveDocumentPathInput,
    isMovingDocument,
    setMoveDocumentPathInput,
    closeMoveDocumentDialog,
    applyMoveDocument,
    newLocalFolderDialogOpen,
    newLocalFolderPathInput,
    isCreatingLocalFolder,
    setNewLocalFolderPathInput,
    openCreateLocalFolderDialog,
    closeCreateLocalFolderDialog,
    handleCreateLocalFolder,
    newLocalFileDialogOpen,
    newLocalFilePathInput,
    isCreatingLocalFile,
    setNewLocalFilePathInput,
    openCreateLocalFileDialog,
    closeCreateLocalFileDialog,
    handleCreateLocalFile,
    localFolderActionDialogOpen,
    localFolderActionMode,
    localFolderFromPath,
    localFolderActionInput,
    isApplyingLocalFolderAction,
    setLocalFolderActionInput,
    openRenameLocalFolderDialog,
    openMoveLocalFolderDialog,
    closeLocalFolderActionDialog,
    applyLocalFolderAction,
    localFolderDeleteConfirmOpen,
    localFolderDeleteTargetPath,
    isDeletingLocalFolder,
    requestDeleteLocalFolder,
    cancelDeleteLocalFolder,
    confirmDeleteLocalFolder,
    handleOpenLocalFileByPath,
    handleMoveLocalFileByPath,
    handleRenameLocalFileByPath,
    handleDeleteLocalFileByPath,
  } = useLocalWorkspaceActions({
    t,
    isTauriRuntime,
    workspace,
    setWorkspace,
    handleSwitchDocument,
    handleDeleteDocument,
    setActivePanel,
    setDraftsExpanded,
    createDocument,
    workspaceSourceMode,
    activeLocalLibraryPath,
    activeWorkspaceRootPath,
    activeDocumentLocalFilePath: activeDocument?.localFilePath,
    debouncedMarkdownInput,
  });
  const currentLocalFileTargetDirectory = getRelativeParentDirectory(newLocalFilePathInput);
  const currentLocalFolderTargetDirectory = getRelativeParentDirectory(newLocalFolderPathInput);
  const currentLocalFileName = getRelativeLeafName(newLocalFilePathInput);
  const currentLocalFolderName = getRelativeLeafName(newLocalFolderPathInput);
  const currentGitFileTargetDirectory = getRelativeParentDirectory(newGitFilePathInput);
  const currentGitFolderTargetDirectory = getRelativeParentDirectory(newGitFolderPathInput);

  const workspaceSwitcherCurrentDetail = useMemo(() => {
    if (workspaceSourceMode === "repository") {
      return {
        sourceLabel: t("workspace.sidebar.projectLab"),
        detailLabel: t("workspace.switcher.repositoryLabel"),
        detailValue:
          selectedGitRepositoryEntry?.repository.repoName ??
          t("workspace.sidebar.contentRepository"),
      };
    }
    return {
      sourceLabel: "",
      detailLabel: t("workspace.switcher.pathLabel"),
      detailValue: activeLocalLibraryPath || t("workspace.switcher.notSet"),
    };
  }, [
    workspaceSourceMode,
    selectedGitRepositoryEntry?.repository.repoName,
    activeLocalLibraryPath,
    t,
  ]);
  const hasPotentialUnsavedChanges = useMemo(
    () =>
      hasPendingEditorInput || isSavingGitFile || isPushingGitFile || isCreatingGitFile,
    [hasPendingEditorInput, isSavingGitFile, isPushingGitFile, isCreatingGitFile]
  );

  const completeStartupEntry = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.startupEntryCompleted, JSON.stringify(true));
    }
    setShowStartupEntry(false);
  };

  const openWorkspaceSwitcher = () => {
    setWorkspaceSwitcherOpen(true);
  };
  const handleSyncWorkspace = async () => {
    if (workspaceSourceMode !== "repository" || !selectedGitRepositoryEntry) return;
    setIsSyncingWorkspace(true);
    try {
      const auth = gitAuthPrefs[selectedGitRepositoryEntry.repository.localPath];
      const now = new Date();
      const response = await invoke<{ status: string; branch: string }>(
        "git_commit_and_push_workspace",
        {
          request: {
            localPath: selectedGitRepositoryEntry.repository.localPath,
            commitMessage: `sync workspace @ ${now.toISOString()}`,
            auth: auth?.token
              ? {
                  username: auth.username || "oauth2",
                  token: auth.token,
                }
              : undefined,
          },
        }
      );
      if (response.status === "no_changes") {
        toast.success(t("workspace.feedback.gitNoChangesToPush"));
      } else {
        toast.success(
          t("workspace.feedback.gitPushSuccess", {
            branch: response.branch || selectedGitRepositoryEntry.repository.branch || "unknown",
          })
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("workspace.feedback.gitPushFailed", { message }));
    } finally {
      setIsSyncingWorkspace(false);
    }
  };
  const runWorkspaceSwitchAction = (action: WorkspaceSwitchAction, force = false) => {
    if (!force && hasPotentialUnsavedChanges) {
      setPendingWorkspaceSwitchAction(action);
      return;
    }

    setPendingWorkspaceSwitchAction(null);
    setWorkspaceSwitcherOpen(false);
    if (action.type === "createLocal") {
      setLocalLibraryAction("create");
      return;
    }
    if (action.type === "openLocal") {
      setLocalLibraryAction("open");
      return;
    }
    if (action.type === "syncRemote") {
      handleStartupSyncRemote();
      return;
    }
    if (action.type === "openRepository") {
      enterRepositoryWorkspace(action.localPath);
      return;
    }
    enterLocalLibrary(action.path, "open");
  };

  const pickLocalLibraryDirectory = async (): Promise<string | null> => {
    if (!isTauriRuntime()) {
      return null;
    }
    try {
      const selectedPath = await invoke<string | null>("pick_local_library_directory");
      return selectedPath ?? null;
    } catch {
      return null;
    }
  };

  const loadLocalLibraryWorkspace = async (localPath: string): Promise<WorkspaceState> => {
    try {
      const snapshots = await invoke<LocalLibraryDocumentSnapshot[]>(
        "list_local_library_documents",
        {
          request: { localPath },
        }
      );
      if (!snapshots.length) {
        const fallback = createDefaultDocument();
        return { documents: [fallback], activeDocumentId: fallback.id };
      }
      const documents: DraftDocument[] = snapshots.map((item) => ({
        id: `local_${item.filePath}_${item.updatedAt}`,
        title: item.title || inferTitle(item.content, newDocumentTitle),
        content: item.content,
        updatedAt: item.updatedAt || Date.now(),
        localFilePath: item.filePath,
      }));
      return {
        documents,
        activeDocumentId: documents[0].id,
      };
    } catch {
      const fallback = createDefaultDocument();
      return { documents: [fallback], activeDocumentId: fallback.id };
    }
  };

  const rememberLocalLibraryPath = (path: string) => {
    const normalizedPath = path.trim();
    if (!normalizedPath) return;
    setRecentLocalLibraryPaths((prev) =>
      [normalizedPath, ...prev.filter((item) => item !== normalizedPath)].slice(0, 6)
    );
  };

  const enterLocalLibrary = (selectedPath: string, action: LocalLibraryAction) => {
    setActiveLocalLibraryPath(selectedPath);
    setWorkspaceSourceMode("local");
    if (action === "create") {
      const starterDocument = createDefaultDocument();
      const initialContent = starterDocument.content;
      const fileName = buildLocalMarkdownFileName(starterDocument.title || newDocumentTitle);
      const document: DraftDocument = {
        ...starterDocument,
        localFilePath: fileName,
      };
      void saveLocalLibraryDocument(selectedPath, fileName, initialContent).catch(() => {
        toast.error(t("workspace.sidebar.localWriteFailed"));
      });
      setWorkspace({ documents: [document], activeDocumentId: document.id });
      void refreshLocalWorkspaceTree(selectedPath);
    } else {
      void loadLocalLibraryWorkspace(selectedPath).then((workspace) => {
        setWorkspace(workspace);
      });
      void refreshLocalWorkspaceTree(selectedPath);
    }
    rememberLocalLibraryPath(selectedPath);
    setLocalLibraryAction(null);
    completeStartupEntry();
  };

  const handleSelectLocalLibraryFromSystem = async () => {
    if (!localLibraryAction) return;
    const selectedPath = await pickLocalLibraryDirectory();
    if (!selectedPath) return;
    enterLocalLibrary(selectedPath, localLibraryAction);
  };

  const handleStartupSyncRemote = () => {
    setWorkspaceSourceMode("repository");
    completeStartupEntry();
    setSettingsSection("git");
    setSettingsOpen(true);
  };

  const enterRepositoryWorkspace = (localPath: string) => {
    const normalizedRepoPath = localPath.trim();
    if (!normalizedRepoPath) return;
    const nextWorkspaceKey = workspaceStorageKeyForPath("repository", normalizedRepoPath);
    const matchedRepository = gitRepositories.find(
      (repository) => repository.localPath === normalizedRepoPath
    );
    const repositoryHasContent = matchedRepository
      ? countRepositoryContentFiles(matchedRepository.files, matchedRepository.folders) > 0
      : true;
    const nextWorkspace = repositoryHasContent
      ? getInitialWorkspace(nextWorkspaceKey, "repository", normalizedRepoPath)
      : (() => {
          const fallback = createLocalizedBlankDocument();
          return { documents: [fallback], activeDocumentId: fallback.id };
        })();
    setWorkspaceSourceMode("repository");
    setPersistedSelectedGitRepoLocalPath(normalizedRepoPath);
    setSelectedRepoLocalPath(normalizedRepoPath);
    setWorkspace(nextWorkspace);
  };

  const executeStartupEntryAction = (index: number) => {
    if (index === 0) {
      setLocalLibraryAction("create");
      return;
    }
    if (index === 1) {
      setLocalLibraryAction("open");
      return;
    }
    handleStartupSyncRemote();
  };

  useEffect(() => {
    if (!showStartupEntry) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        completeStartupEntry();
        return;
      }
      if (localLibraryAction) return;
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        setStartupEntryFocusIndex((prev) => (prev + 1) % 3);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        setStartupEntryFocusIndex((prev) => (prev + 2) % 3);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        executeStartupEntryAction(startupEntryFocusIndex);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showStartupEntry, localLibraryAction, startupEntryFocusIndex]);

  useEffect(() => {
    if (!showStartupEntry || localLibraryAction) return;
    setStartupEntryFocusIndex(0);
  }, [showStartupEntry, localLibraryAction]);

  const confirmDeleteDocument = async () => {
    if (!deleteConfirmDocumentId) return;
    if (activeWorkspaceRootPath) {
      const deletingDocument = workspace.documents.find(
        (doc) => doc.id === deleteConfirmDocumentId
      );
      if (deletingDocument?.localFilePath) {
        try {
          await deleteLocalFileAndRefresh(deletingDocument.localFilePath);
        } catch {
          toast.error(t("workspace.sidebar.localDeleteFailed"));
          return;
        }
      }
    }
    confirmDeleteDocumentInWorkspace();
  };

  const localLibraryDialog = (
    <Dialog
      open={Boolean(localLibraryAction)}
      onOpenChange={(open) => {
        if (!open) setLocalLibraryAction(null);
      }}
    >
      <DialogContent className="app-modal-shell max-w-[560px] rounded-[16px] p-0">
        <DialogTitle className="border-b border-[var(--app-border)] px-5 py-4 text-[16px] font-semibold text-[var(--app-text)]">
          {localLibraryAction === "create"
            ? t("workspace.startup.dialog.createTitle")
            : t("workspace.startup.dialog.openTitle")}
        </DialogTitle>
        <div className="space-y-3 px-5 py-4">
          <p className="text-[13px] leading-6 text-[var(--app-text-soft)]">
            {localLibraryAction === "create"
              ? t("workspace.startup.dialog.createDescription")
              : t("workspace.startup.dialog.openDescription")}
          </p>
          {recentLocalLibraryPaths.length > 0 ? (
            <div className="app-soft-panel rounded-[12px] p-2">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                {t("workspace.startup.dialog.recentLibraries")}
              </div>
              <div className="mt-1 space-y-1">
                {recentLocalLibraryPaths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => {
                      if (!localLibraryAction) return;
                      enterLocalLibrary(path, localLibraryAction);
                    }}
                    className="app-tree-row w-full rounded-[8px] px-2 py-2 text-left"
                    title={path}
                  >
                    <div className="truncate text-[12px] font-medium text-[var(--app-text)]">
                      {path.split(/[\\/]/).filter(Boolean).pop() || path}
                    </div>
                    <div className="truncate text-[11px] text-[var(--app-text-soft)]">{path}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
          <button
            type="button"
            onClick={() => setLocalLibraryAction(null)}
            className="app-btn-neutral inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-3 text-xs"
          >
            {t("workspace.common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSelectLocalLibraryFromSystem()}
            className="app-btn-primary inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-3 text-xs font-semibold"
          >
            {localLibraryAction === "create"
              ? t("workspace.startup.dialog.selectCreateDirectory")
              : t("workspace.startup.dialog.selectOpenDirectory")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (showStartupEntry) {
    return (
      <div className="relative flex h-screen items-center justify-center overflow-hidden bg-[var(--app-bg)] antialiased">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="app-ambient-orb left-[-10%] top-[-16%] h-[340px] w-[340px]" />
          <div className="app-ambient-orb right-[-8%] top-[4%] h-[300px] w-[300px]" />
          <div className="app-ambient-orb bottom-[-12%] left-[18%] h-[260px] w-[260px]" />
        </div>
        <div className="app-modal-shell relative w-full max-w-[660px] rounded-[20px] p-6 backdrop-blur-xl">
          <button
            type="button"
            onClick={completeStartupEntry}
            className="app-icon-button absolute right-4 top-4 h-11 w-11 rounded-[10px]"
            aria-label={t("settings.close")}
            title={t("settings.close")}
          >
            <X size={14} />
          </button>
          <div className="mb-5">
            <h1 className="text-[20px] font-semibold text-[var(--app-text)]">
              {t("workspace.startup.title")}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--app-text-soft)]">
              {t("workspace.startup.description")}
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => executeStartupEntryAction(0)}
              onMouseEnter={() => setStartupEntryFocusIndex(0)}
              className={`app-btn-primary group flex w-full items-center justify-between rounded-[var(--radius-button)] border px-4 py-4 text-left text-white ${
                startupEntryFocusIndex === 0
                  ? "border-[var(--app-accent)] ring-2 ring-[var(--app-accent-soft)]"
                  : "border-[var(--app-accent)]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="bg-white/18 inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-white">
                  <FolderPlus size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">
                    {t("workspace.startup.createLocal")}
                  </div>
                  <div className="text-[12px] text-white/80">
                    {t("workspace.startup.createLocalHint")}
                  </div>
                </div>
              </div>
              <span className="bg-white/18 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white">
                {t("workspace.startup.recommended")}
              </span>
            </button>

            <div className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-faint)]">
              {t("workspace.startup.otherOptions")}
            </div>
            <button
              onClick={() => executeStartupEntryAction(1)}
              onMouseEnter={() => setStartupEntryFocusIndex(1)}
              className={`app-card-interactive flex w-full items-center gap-3 rounded-[14px] px-4 py-4 text-left ${
                startupEntryFocusIndex === 1
                  ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-accent-soft)]"
                  : ""
              }`}
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--app-accent-soft)] text-[var(--app-text-soft)]">
                <FolderOpen size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-[var(--app-text)]">
                  {t("workspace.startup.openLocal")}
                </div>
                <div className="text-[12px] text-[var(--app-text-soft)]">
                  {t("workspace.startup.openLocalHint")}
                </div>
              </div>
              <ChevronRight size={15} className="text-[var(--app-text-faint)]" />
            </button>

            <button
              onClick={() => executeStartupEntryAction(2)}
              onMouseEnter={() => setStartupEntryFocusIndex(2)}
              className={`app-card-interactive flex w-full items-center gap-3 rounded-[14px] px-4 py-4 text-left ${
                startupEntryFocusIndex === 2
                  ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-accent-soft)]"
                  : ""
              }`}
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--app-accent-soft)] text-[var(--app-text-soft)]">
                <GitBranch size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-[var(--app-text)]">
                  {t("workspace.startup.syncRemote")}
                </div>
                <div className="text-[12px] text-[var(--app-text-soft)]">
                  {t("workspace.startup.syncRemoteHint")}
                </div>
              </div>
              <ChevronRight size={15} className="text-[var(--app-text-faint)]" />
            </button>
          </div>
        </div>
        {localLibraryDialog}
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-[var(--app-bg)] antialiased transition-colors duration-300">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="app-ambient-orb left-[-10%] top-[-16%] h-[340px] w-[340px]" />
        <div className="app-ambient-orb right-[-8%] top-[4%] h-[300px] w-[300px]" />
        <div className="app-ambient-orb bottom-[-12%] left-[18%] h-[260px] w-[260px]" />
      </div>
      <Toaster richColors position="top-right" />
      <UpdaterDialog
        proxyUrl={updaterProxyUrl}
        externalUpdate={pendingUpdate}
        externalChecking={updateChecking}
        externalDownloading={updateDownloading}
        externalProgress={updateProgress}
        externalCheckError={updateCheckError}
        externalCheckUpdate={updaterCheckUpdate}
        externalInstallUpdate={updaterInstallUpdate}
      />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          data-tauri-drag-region
          className={`app-topbar hidden items-center justify-between gap-4 px-5 py-2 md:flex ${isMacDesktop ? "md:pl-[68px]" : ""}`}
        >
          <div
            className={`flex items-center gap-3 ${
              isMacDesktop
                ? `md:w-[228px] ${sidebarCollapsed ? "md:justify-start md:pl-2" : "md:justify-end md:pr-2"}`
                : ""
            }`}
          >
            <button
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="app-title-icon-btn"
              aria-label={
                sidebarCollapsed
                  ? t("workspace.header.expandSidebar")
                  : t("workspace.header.collapseSidebar")
              }
              title={
                sidebarCollapsed
                  ? t("workspace.header.expandSidebar")
                  : t("workspace.header.collapseSidebar")
              }
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={16} strokeWidth={1.85} />
              ) : (
                <PanelLeftClose size={16} strokeWidth={1.85} />
              )}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCoverGeneratorOpen(true)}
              className={`${primaryToolbarButtonClass} app-toolbar-btn`}
            >
              <Sparkles size={13} />
              <span>{t("workspace.actions.coverGenerator")}</span>
            </button>
            <button
              onClick={handleCopy}
              disabled={isCopying}
              className={`${primaryToolbarButtonClass} ${copied ? "app-toolbar-btn-success" : "app-toolbar-btn"} ${isCopying ? "cursor-not-allowed opacity-80" : ""}`}
            >
              {copied ? (
                <CheckCircle2 size={13} />
              ) : isCopying ? (
                <Loader2 className="animate-spin" size={13} />
              ) : (
                <Copy size={13} />
              )}
              <span>
                {copied
                  ? t("workspace.actions.copied")
                  : isCopying
                    ? t("workspace.actions.processing")
                    : t("workspace.actions.copyToWechat")}
              </span>
            </button>
            {workspaceSourceMode === "repository" ? (
              <button
                onClick={() => void handleSyncWorkspace()}
                disabled={isSyncingWorkspace}
                className={`${primaryToolbarButtonClass} app-toolbar-btn ${isSyncingWorkspace ? "cursor-not-allowed opacity-80" : ""}`}
              >
                {isSyncingWorkspace ? (
                  <Loader2 className="animate-spin" size={13} />
                ) : (
                  <RefreshCw size={13} />
                )}
                <span>
                  {isSyncingWorkspace
                    ? t("workspace.actions.processing")
                    : t("workspace.actions.syncWorkspace")}
                </span>
              </button>
            ) : null}
            <button
              onClick={handlePublishToDraft}
              disabled={isPublishingDraft}
              className="app-toolbar-btn-primary disabled:opacity-60"
            >
              {isPublishingDraft ? (
                <Loader2 className="animate-spin" size={13} />
              ) : (
                <Send size={13} />
              )}
              <span>
                {isPublishingDraft
                  ? t("workspace.actions.publishing")
                  : t("workspace.actions.publishDraft")}
              </span>
            </button>
          </div>
        </div>

        <div className="app-topbar z-[90] flex items-center md:hidden">
          <button
            data-testid="tab-editor"
            onClick={() => setActivePanel("editor")}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-[13px] font-semibold transition-colors ${activePanel === "editor" ? "border-[var(--app-accent)] text-[var(--app-accent)]" : "border-transparent text-[var(--app-text-soft)]"}`}
          >
            <PenLine size={15} />
            {t("workspace.tabs.editor")}
          </button>
          <button
            data-testid="tab-preview"
            onClick={() => setActivePanel("preview")}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-[13px] font-semibold transition-colors ${activePanel === "preview" ? "border-[var(--app-accent)] text-[var(--app-accent)]" : "border-transparent text-[var(--app-text-soft)]"}`}
          >
            <Eye size={15} />
            {t("workspace.tabs.preview")}
          </button>
        </div>

        {/* Mobile toolbar */}
        <div className="app-topbar z-[90] md:hidden">
          <div className="px-4 pt-3">
            <button
              onClick={() => setCoverGeneratorOpen(true)}
              className="app-toolbar-btn px-3.5 py-2 text-xs font-medium"
            >
              <Sparkles size={13} />
              <span>{t("workspace.actions.coverGenerator")}</span>
            </button>
          </div>
          <Toolbar
            previewDevice={previewDevice}
            onDeviceChange={setPreviewDevice}
            onCopy={handleCopy}
            copied={copied}
            isCopying={isCopying}
            scrollSyncEnabled={scrollSyncEnabled}
            onToggleScrollSync={() => setScrollSyncEnabled((prev) => !prev)}
          />
        </div>

        {/* Desktop three-column layout */}
        {isDesktop && (
          <main
            className={`grid min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(253,241,239,0.34),transparent_18%)] ${sidebarCollapsed ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[296px_minmax(0,1fr)_minmax(0,1fr)]"}`}
          >
            {!sidebarCollapsed && (
              <WorkspaceSidebar
                t={t}
                gitRepositoriesWithContent={gitRepositoriesWithContent}
                selectedGitRepositoryEntry={selectedGitRepositoryEntry}
                documentSearch={documentSearch}
                setDocumentSearch={setDocumentSearch}
                visibleGitContentFiles={visibleGitContentFiles}
                visibleGitContentFolders={visibleGitContentFolders}
                isGitFolderExpanded={isGitFolderExpanded}
                toggleGitFolderExpanded={toggleGitFolderExpanded}
                handleOpenCreateGitFileDialog={handleOpenCreateGitFileDialog}
                handleOpenCreateGitFolderDialog={handleOpenCreateGitFolderDialog}
                handleRenameGitEntry={openRenameGitEntryDialog}
                handleMoveGitEntry={moveGitEntryToDirectory}
                handleDeleteGitEntry={requestDeleteGitEntry}
                handleGitFileClick={handleGitFileClick}
                countGitContentFiles={countGitContentFiles}
                actionsDisabled={
                  isSavingGitFile ||
                  isPushingGitFile ||
                  isCreatingGitFile ||
                  isCreatingGitFolder ||
                  isApplyingGitEntryAction
                }
                draftsExpanded={draftsExpanded}
                setDraftsExpanded={setDraftsExpanded}
                handleOpenCreateLocalFolderDialog={openCreateLocalFolderDialog}
                localActionsDisabled={
                  isMovingDocument ||
                  isCreatingLocalFolder ||
                  isCreatingLocalFile ||
                  isApplyingLocalFolderAction ||
                  isDeletingLocalFolder
                }
                localWorkspaceFiles={localWorkspaceTree.files}
                localWorkspaceFolders={localWorkspaceTree.folders}
                filteredDocuments={filteredDocuments}
                handleOpenLocalFileByPath={handleOpenLocalFileByPath}
                handleDeleteLocalFileByPath={handleDeleteLocalFileByPath}
                handleMoveLocalFileByPath={handleMoveLocalFileByPath}
                handleRenameLocalFileByPath={handleRenameLocalFileByPath}
                handleRenameLocalFolder={openRenameLocalFolderDialog}
                handleMoveLocalFolder={openMoveLocalFolderDialog}
                handleDeleteLocalFolder={requestDeleteLocalFolder}
                handleCreateLocalFileInFolder={openCreateLocalFileDialog}
                handleCreateLocalFolderInFolder={openCreateLocalFolderDialog}
                openGeneralSettings={() => openSettings("general")}
                pendingUpdate={pendingUpdate}
                workspaceSourceMode={workspaceSourceMode}
                currentProjectName={currentProjectName}
                activeLocalLibraryPath={activeLocalLibraryPath}
                recentLocalLibraryPaths={recentLocalLibraryPaths}
                onSelectLocalWorkspace={(path) =>
                  runWorkspaceSwitchAction({ type: "openRecentLocal", path })
                }
                onSelectRepositoryWorkspace={(localPath) =>
                  runWorkspaceSwitchAction({ type: "openRepository", localPath })
                }
                onOpenRepositoryManager={openWorkspaceSwitcher}
                onOpenCreateLocalFileDialog={openCreateLocalFileDialog}
                onOpenCreateGitFileDialogInFolder={handleOpenCreateGitFileDialog}
                onOpenCreateGitFolderDialogInFolder={handleOpenCreateGitFolderDialog}
              />
            )}

            <div className="flex min-h-0 flex-col overflow-hidden">
              {activeGitSourceDocument && (
                <div className="app-topbar flex h-12 items-center border-b border-[var(--app-border)] px-4 text-[12px]">
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-[var(--app-text-soft)]">
                      <FolderGit2 size={13} />
                      <span className="truncate font-medium text-[var(--app-text)]">
                        {activeGitSourceDocument.gitRepositoryName ??
                          t("workspace.sidebar.contentRepository")}
                      </span>
                      <span>/</span>
                      <span>{activeGitSourceDocument.gitBranch ?? "unknown"}</span>
                      <span>/</span>
                      <span className="truncate" title={activeGitSourceDocument.gitFilePath ?? ""}>
                        {activeGitSourceDocument.gitFilePath ?? ""}
                      </span>
                      <span className="app-chip h-7 whitespace-nowrap rounded-[999px] px-2.5 text-[11px]">
                        {t("workspace.sidebar.syncedContent")}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={handleSaveActiveGitFile}
                        disabled={
                          isSavingGitFile ||
                          isPushingGitFile ||
                          isCreatingGitFile ||
                          isCreatingGitFolder ||
                          isApplyingGitEntryAction
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--app-border)] px-3 py-0 text-xs text-[var(--app-text-soft)] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingGitFile ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Save size={12} />
                        )}
                        <span>{t("workspace.sidebar.saveToRepository")}</span>
                      </button>
                      <button
                        onClick={handleCommitAndPushActiveGitFile}
                        disabled={
                          isSavingGitFile ||
                          isPushingGitFile ||
                          isCreatingGitFile ||
                          isCreatingGitFolder ||
                          isApplyingGitEntryAction
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--app-accent)] px-3 py-0 text-xs font-semibold text-white hover:bg-[var(--app-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPushingGitFile ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CloudUpload size={12} />
                        )}
                        <span>{t("workspace.sidebar.commitAndPush")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <EditorPanel
                markdownInput={markdownInput}
                onInputChange={updateActiveDocument}
                onUploadClipboardImage={uploadClipboardImage}
                editorScrollRef={editorScrollRef}
                onEditorScroll={handleEditorScroll}
                scrollSyncEnabled={scrollSyncEnabled}
              />
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden border-l border-[var(--app-border)]">
              {activeGitSourceDocument && (
                <div className="app-topbar flex h-12 items-center border-b border-[var(--app-border)] px-4 text-[12px] text-[var(--app-text-soft)]">
                  {t("workspace.sidebar.previewSyncedCopy")}
                </div>
              )}
              <PreviewPanel
                renderedHtml={renderedHtml}
                deviceWidthClass={deviceWidthClass()}
                previewDevice={previewDevice}
                previewRef={previewRef}
                previewOuterScrollRef={previewOuterScrollRef}
                previewInnerScrollRef={previewInnerScrollRef}
                onPreviewOuterScroll={handlePreviewOuterScroll}
                onPreviewInnerScroll={handlePreviewInnerScroll}
                scrollSyncEnabled={scrollSyncEnabled}
              />
            </div>
          </main>
        )}

        {/* Mobile two-panel switch */}
        {!isDesktop && (
          <main className="relative grid flex-1 grid-cols-1 overflow-hidden">
            <div
              className={`${activePanel === "editor" ? "flex" : "hidden"} flex-col overflow-hidden`}
            >
              {activeGitSourceDocument && (
                <div className="app-topbar flex h-12 items-center border-b border-[var(--app-border)] px-4 text-[12px]">
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 text-[var(--app-text-soft)]">
                      <FolderGit2 size={13} />
                      <span className="truncate font-medium text-[var(--app-text)]">
                        {activeGitSourceDocument.gitRepositoryName ??
                          t("workspace.sidebar.contentRepository")}
                      </span>
                      <span>/</span>
                      <span>{activeGitSourceDocument.gitBranch ?? "unknown"}</span>
                      <span>/</span>
                      <span className="truncate" title={activeGitSourceDocument.gitFilePath ?? ""}>
                        {activeGitSourceDocument.gitFilePath ?? ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={handleSaveActiveGitFile}
                        disabled={isSavingGitFile || isPushingGitFile || isCreatingGitFile}
                        aria-label={t("workspace.sidebar.saveToRepository")}
                        title={t("workspace.sidebar.saveToRepository")}
                        className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-[var(--radius-button)] border border-[var(--app-border)] px-2.5 py-0 text-xs text-[var(--app-text-soft)] disabled:opacity-60"
                      >
                        {isSavingGitFile ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Save size={11} />
                        )}
                      </button>
                      <button
                        onClick={handleCommitAndPushActiveGitFile}
                        disabled={isSavingGitFile || isPushingGitFile || isCreatingGitFile}
                        aria-label={t("workspace.sidebar.commitAndPush")}
                        title={t("workspace.sidebar.commitAndPush")}
                        className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-[var(--radius-button)] bg-[var(--app-accent)] px-2.5 py-0 text-xs text-white disabled:opacity-60"
                      >
                        {isPushingGitFile ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <CloudUpload size={11} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <EditorPanel
                markdownInput={markdownInput}
                onInputChange={updateActiveDocument}
                onUploadClipboardImage={uploadClipboardImage}
                editorScrollRef={editorScrollRef}
                onEditorScroll={handleEditorScroll}
                scrollSyncEnabled={scrollSyncEnabled}
              />
            </div>
            <div
              className={`${activePanel === "preview" ? "flex" : "hidden"} flex-col overflow-hidden`}
            >
              {activeGitSourceDocument && (
                <div className="app-topbar flex min-h-[58px] items-center border-b border-[var(--app-border)] px-4 py-3 text-[12px] text-[var(--app-text-soft)]">
                  {t("workspace.sidebar.previewSyncedCopy")}
                </div>
              )}
              <PreviewPanel
                renderedHtml={renderedHtml}
                deviceWidthClass={deviceWidthClass()}
                previewDevice={previewDevice}
                previewRef={previewRef}
                previewOuterScrollRef={previewOuterScrollRef}
                previewInnerScrollRef={previewInnerScrollRef}
                onPreviewOuterScroll={handlePreviewOuterScroll}
                onPreviewInnerScroll={handlePreviewInnerScroll}
                scrollSyncEnabled={scrollSyncEnabled}
              />
            </div>
          </main>
        )}

        <footer className="app-footer-strip flex items-center justify-between gap-3 border-t border-[var(--app-border)] px-3 py-1.5 text-[12px] text-[var(--app-text-soft)] md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="app-chip max-w-[220px] truncate rounded-[999px] px-2.5 py-0.5 text-[var(--app-text)]">
              {t("workspace.footer.document")}{" "}
              {activeDocument?.title ?? t("workspace.sidebar.untitled")}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="app-chip rounded-[999px] px-2 py-[3px] font-mono">
              {markdownInput.length} {t("workspace.footer.words")}
            </span>
            <span className="app-chip rounded-[999px] px-2 py-[3px]">
              {previewDevice === "mobile"
                ? t("workspace.devices.mobile")
                : previewDevice === "tablet"
                  ? t("workspace.devices.tablet")
                  : t("workspace.devices.desktop")}
            </span>
            <span className="app-chip rounded-[999px] px-2 py-[3px]">
              {t("workspace.footer.theme")} {activeThemeName}
            </span>
            <span
              className={`rounded-[999px] px-2 py-[3px] ${scrollSyncEnabled ? "app-chip app-chip-active" : "app-chip"}`}
            >
              {scrollSyncEnabled ? t("workspace.footer.syncOn") : t("workspace.footer.syncOff")}
            </span>
          </div>
        </footer>

        <Dialog open={workspaceSwitcherOpen} onOpenChange={setWorkspaceSwitcherOpen}>
          <DialogContent
            showCloseButton={true}
            className="app-modal-shell !w-[min(560px,calc(100vw-2rem))] !max-w-[560px] overflow-hidden rounded-[18px] p-0 [&_[data-slot='dialog-close']]:right-3 [&_[data-slot='dialog-close']]:top-3 [&_[data-slot='dialog-close']]:h-7 [&_[data-slot='dialog-close']]:w-7 [&_[data-slot='dialog-close']]:rounded-[8px] [&_[data-slot='dialog-close']]:shadow-none"
          >
            <DialogTitle className="border-b border-[var(--app-border)] px-5 py-4 text-[16px] font-semibold tracking-[-0.02em] text-[var(--app-text)]">
              {t("workspace.switcher.title")}
            </DialogTitle>
            <div className="space-y-3 px-5 py-4">
              <div className="app-soft-panel rounded-[14px] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                  {t("workspace.switcher.current")}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[13px]">
                  <span className="font-semibold text-[var(--app-text)]">{currentProjectName}</span>
                  {workspaceSwitcherCurrentDetail.sourceLabel ? (
                    <span className="app-status-badge app-status-badge-info px-2 py-0.5 uppercase tracking-[0.08em]">
                      {workspaceSwitcherCurrentDetail.sourceLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 truncate text-[11px] text-[var(--app-text-soft)]">
                  {workspaceSwitcherCurrentDetail.detailLabel}:{" "}
                  {workspaceSwitcherCurrentDetail.detailValue}
                </div>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => runWorkspaceSwitchAction({ type: "createLocal" })}
                  className="bg-[var(--app-accent)]/10 hover:bg-[var(--app-accent)]/15 flex min-h-[48px] w-full items-center justify-between rounded-[14px] border border-[var(--app-accent)] px-4 py-3 text-left text-[13px] font-semibold text-[var(--app-text)] transition"
                >
                  <span>{t("workspace.startup.createLocal")}</span>
                  <span className="text-[11px] text-[var(--app-text-soft)]">
                    {t("workspace.startup.recommended")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => runWorkspaceSwitchAction({ type: "openLocal" })}
                  className="app-card-interactive flex min-h-[48px] w-full items-center rounded-[14px] px-4 py-3 text-left text-[13px] font-medium text-[var(--app-text)]"
                >
                  {t("workspace.startup.openLocal")}
                </button>
                <button
                  type="button"
                  onClick={() => runWorkspaceSwitchAction({ type: "syncRemote" })}
                  className="app-card-interactive flex min-h-[48px] w-full items-center rounded-[14px] px-4 py-3 text-left text-[13px] font-medium text-[var(--app-text)]"
                >
                  {t("workspace.startup.syncRemote")}
                </button>
              </div>
              {recentLocalLibraryPaths.length > 0 ? (
                <div className="app-soft-panel rounded-[14px] p-2.5">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-soft)]">
                    {t("workspace.startup.dialog.recentLibraries")}
                  </div>
                  <div className="mt-1 space-y-1">
                    {recentLocalLibraryPaths.map((path) => (
                      <button
                        key={`switcher_${path}`}
                        type="button"
                        onClick={() => runWorkspaceSwitchAction({ type: "openRecentLocal", path })}
                        className="app-tree-row w-full rounded-[10px] px-2.5 py-2.5 text-left"
                        title={path}
                      >
                        <div className="truncate text-[12px] font-medium text-[var(--app-text)]">
                          {path.split(/[\\/]/).filter(Boolean).pop() || path}
                        </div>
                        <div className="truncate text-[11px] text-[var(--app-text-soft)]">
                          {path}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setWorkspaceSwitcherOpen(false)}
                className="app-btn-neutral inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-4 text-sm font-medium transition"
              >
                {t("workspace.common.cancel")}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(pendingWorkspaceSwitchAction)}
          onOpenChange={(open) => {
            if (!open) setPendingWorkspaceSwitchAction(null);
          }}
        >
          <DialogContent
            showCloseButton={true}
            className="app-modal-shell !w-[min(360px,calc(100vw-2rem))] !max-w-[360px] overflow-hidden rounded-[12px] px-5 py-4 [&_[data-slot='dialog-close']]:right-3 [&_[data-slot='dialog-close']]:top-3 [&_[data-slot='dialog-close']]:h-7 [&_[data-slot='dialog-close']]:w-7 [&_[data-slot='dialog-close']]:rounded-[8px] [&_[data-slot='dialog-close']]:shadow-none"
          >
            <DialogTitle className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--app-text)]">
              {t("workspace.switcher.unsavedTitle")}
            </DialogTitle>
            <div className="mt-2 text-[14px] leading-6 text-[var(--app-text-soft)]">
              {t("workspace.switcher.unsavedDescription")}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => setPendingWorkspaceSwitchAction(null)}
                className="app-btn-neutral flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-button)] text-[14px] font-medium transition"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={() => {
                  if (!pendingWorkspaceSwitchAction) return;
                  runWorkspaceSwitchAction(pendingWorkspaceSwitchAction, true);
                }}
                className="app-btn-primary flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-button)] text-[14px] font-semibold transition"
              >
                {t("workspace.switcher.continueSwitch")}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {localLibraryDialog}

        <Dialog
          open={newGitFileDialogOpen}
          onOpenChange={(open) => {
            setNewGitFileDialogOpen(open);
            if (!open) {
              closeNewGitFileDialog();
            }
          }}
        >
          <DialogContent className="app-modal-shell max-w-[520px] rounded-[16px] p-0">
            <DialogTitle className="border-b border-[var(--app-border)] px-5 py-4 text-[16px] font-semibold text-[var(--app-text)]">
              {t("workspace.sidebar.newRepositoryFile")}
            </DialogTitle>
            <div className="space-y-3 px-5 py-4">
              <div className="text-xs text-[var(--app-text-soft)]">
                {t("workspace.sidebar.newRepositoryFileTip", {
                  baseDir: newGitFileTarget?.baseDir || "/",
                })}
              </div>
              <div className="rounded-[var(--radius-sm)] bg-[var(--app-accent-soft)] px-3 py-2 text-xs text-[var(--app-text)]">
                {t("workspace.sidebar.targetDirectoryLabel")}{" "}
                {currentGitFileTargetDirectory || t("workspace.documentActions.rootDirectory")}
              </div>
              <input
                value={newGitFilePathInput}
                onChange={(event) => setNewGitFilePathInput(event.target.value)}
                placeholder={t("workspace.sidebar.newRepositoryFilePlaceholder")}
                className="app-input h-[44px] px-3 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
              <button
                onClick={closeNewGitFileDialog}
                className="app-btn-neutral inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-3 text-xs"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={handleCreateGitFile}
                disabled={isCreatingGitFile}
                className="app-btn-primary inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-button)] px-3 text-xs font-semibold disabled:opacity-60"
              >
                {isCreatingGitFile && <Loader2 size={12} className="animate-spin" />}
                {t("workspace.sidebar.createRepositoryFile")}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={newGitFolderDialogOpen}
          onOpenChange={(open) => {
            setNewGitFolderDialogOpen(open);
            if (!open) {
              closeNewGitFolderDialog();
            }
          }}
        >
          <DialogContent className="app-modal-shell max-w-[520px] rounded-[16px] p-0">
            <DialogTitle className="border-b border-[var(--app-border)] px-5 py-4 text-[16px] font-semibold text-[var(--app-text)]">
              {t("workspace.sidebar.newRepositoryFolder")}
            </DialogTitle>
            <div className="space-y-3 px-5 py-4">
              <div className="text-xs text-[var(--app-text-soft)]">
                {t("workspace.sidebar.newRepositoryFolderTip", {
                  baseDir: newGitFolderTarget?.baseDir || "/",
                })}
              </div>
              <div className="rounded-[var(--radius-sm)] bg-[var(--app-accent-soft)] px-3 py-2 text-xs text-[var(--app-text)]">
                {t("workspace.sidebar.targetDirectoryLabel")}{" "}
                {currentGitFolderTargetDirectory || t("workspace.documentActions.rootDirectory")}
              </div>
              <input
                value={newGitFolderPathInput}
                onChange={(event) => setNewGitFolderPathInput(event.target.value)}
                placeholder={t("workspace.sidebar.newRepositoryFolderPlaceholder")}
                className="app-input h-[44px] px-3 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
              <button
                onClick={closeNewGitFolderDialog}
                className="app-btn-neutral inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-3 text-xs"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={handleCreateGitFolder}
                disabled={isCreatingGitFolder}
                className="app-btn-primary inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-button)] px-3 text-xs font-semibold disabled:opacity-60"
              >
                {isCreatingGitFolder && <Loader2 size={12} className="animate-spin" />}
                {t("workspace.sidebar.createRepositoryFolder")}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={gitEntryActionDialogOpen}
          onOpenChange={(open) => {
            setGitEntryActionDialogOpen(open);
            if (!open) {
              closeGitEntryActionDialog();
            }
          }}
        >
          <DialogContent className="app-modal-shell max-w-[520px] rounded-[16px] p-0">
            <DialogTitle className="border-b border-[var(--app-border)] px-5 py-4 text-[16px] font-semibold text-[var(--app-text)]">
              {gitPathActionMode === "rename"
                ? t("workspace.sidebar.renameRepositoryEntry")
                : t("workspace.sidebar.moveRepositoryEntry")}
            </DialogTitle>
            <div className="space-y-3 px-5 py-4">
              <div className="text-xs text-[var(--app-text-soft)]">
                {gitPathActionMode === "rename"
                  ? t("workspace.sidebar.renameRepositoryEntryTip", {
                      target: gitEntryActionTarget?.fromPath || "",
                    })
                  : t("workspace.sidebar.moveRepositoryEntryTip", {
                      target: gitEntryActionTarget?.fromPath || "",
                    })}
              </div>
              <input
                value={gitEntryActionInput}
                onChange={(event) => setGitEntryActionInput(event.target.value)}
                placeholder={
                  gitPathActionMode === "rename"
                    ? t("workspace.sidebar.renameRepositoryEntryPlaceholder")
                    : t("workspace.sidebar.moveRepositoryEntryPlaceholder")
                }
                className="app-input h-[44px] px-3 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
              <button
                onClick={closeGitEntryActionDialog}
                className="app-btn-neutral inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-3 text-xs"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={applyGitEntryPathAction}
                disabled={isApplyingGitEntryAction}
                className="app-btn-primary inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-button)] px-3 text-xs font-semibold disabled:opacity-60"
              >
                {isApplyingGitEntryAction && <Loader2 size={12} className="animate-spin" />}
                {gitPathActionMode === "rename"
                  ? t("workspace.documentActions.rename")
                  : t("workspace.documentActions.move")}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={gitDeleteConfirmOpen}
          onOpenChange={(open) => {
            if (!open) {
              cancelDeleteGitEntry();
            }
          }}
        >
          <DialogContent
            showCloseButton={true}
            className="app-modal-shell !w-[min(360px,calc(100vw-2rem))] !max-w-[360px] overflow-hidden rounded-[12px] px-5 py-4 [&_[data-slot='dialog-close']]:right-3 [&_[data-slot='dialog-close']]:top-3 [&_[data-slot='dialog-close']]:h-7 [&_[data-slot='dialog-close']]:w-7 [&_[data-slot='dialog-close']]:rounded-[8px] [&_[data-slot='dialog-close']]:shadow-none"
          >
            <DialogTitle className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--app-text)]">
              {t("workspace.sidebar.deleteRepositoryEntry")}
            </DialogTitle>
            <div className="mt-2 text-[14px] leading-6 text-[var(--app-text-soft)]">
              {t("workspace.sidebar.deleteRepositoryEntryTip", {
                target: gitDeleteTarget?.path || "",
              })}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={cancelDeleteGitEntry}
                className="app-btn-neutral flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-button)] text-[14px] font-medium transition"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={() => void confirmDeleteGitEntry()}
                disabled={isDeletingGitEntry}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[11px] bg-[var(--app-accent)] text-[14px] font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:opacity-60"
              >
                {isDeletingGitEntry ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  t("workspace.documentActions.delete")
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={moveDocumentDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeMoveDocumentDialog();
          }}
        >
          <DialogContent className="app-modal-shell max-w-[520px] rounded-[16px] p-0">
            <DialogTitle className="border-b border-[var(--app-border)] px-5 py-4 text-[16px] font-semibold text-[var(--app-text)]">
              {moveDocumentMode === "rename"
                ? t("workspace.sidebar.renameLocalDocument")
                : t("workspace.sidebar.moveLocalDocument")}
            </DialogTitle>
            <div className="space-y-3 px-5 py-4">
              <div className="text-xs text-[var(--app-text-soft)]">
                {moveDocumentMode === "rename"
                  ? t("workspace.sidebar.renameLocalDocumentTip")
                  : t("workspace.sidebar.moveLocalDocumentTip")}
              </div>
              <input
                value={moveDocumentPathInput}
                onChange={(event) => setMoveDocumentPathInput(event.target.value)}
                placeholder={
                  moveDocumentMode === "rename"
                    ? t("workspace.sidebar.renameLocalDocumentPlaceholder")
                    : t("workspace.sidebar.moveLocalDocumentPlaceholder")
                }
                className="app-input h-[44px] px-3 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
              <button
                onClick={closeMoveDocumentDialog}
                className="app-btn-neutral inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-3 text-xs"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={() => void applyMoveDocument()}
                disabled={isMovingDocument}
                className="app-btn-primary inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-button)] px-3 text-xs font-semibold disabled:opacity-60"
              >
                {isMovingDocument && <Loader2 size={12} className="animate-spin" />}
                {t("workspace.documentActions.move")}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={newLocalFileDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeCreateLocalFileDialog();
          }}
        >
          <DialogContent className="app-modal-shell max-w-[520px] rounded-[16px] p-0">
            <DialogTitle className="border-b border-[var(--app-border)] px-5 py-4 text-[16px] font-semibold text-[var(--app-text)]">
              {t("workspace.sidebar.createLocalFile")}
            </DialogTitle>
            <div className="space-y-3 px-5 py-4">
              <div className="text-xs text-[var(--app-text-soft)]">
                {t("workspace.sidebar.createLocalFileTip")}
              </div>
              <div className="rounded-[var(--radius-sm)] bg-[var(--app-accent-soft)] px-3 py-2 text-xs text-[var(--app-text)]">
                {t("workspace.sidebar.targetDirectoryLabel")}{" "}
                {currentLocalFileTargetDirectory || t("workspace.documentActions.rootDirectory")}
              </div>
              <input
                value={currentLocalFileName}
                onChange={(event) => {
                  const nextName = getRelativeLeafName(event.target.value);
                  const nextPath = currentLocalFileTargetDirectory
                    ? `${currentLocalFileTargetDirectory}/${nextName}`
                    : nextName;
                  setNewLocalFilePathInput(nextPath);
                }}
                placeholder={t("workspace.sidebar.createLocalFilePlaceholder")}
                className="app-input h-[44px] px-3 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
              <button
                onClick={closeCreateLocalFileDialog}
                className="app-btn-neutral inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-3 text-xs"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={() => void handleCreateLocalFile()}
                disabled={isCreatingLocalFile}
                className="app-btn-primary inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-button)] px-3 text-xs font-semibold disabled:opacity-60"
              >
                {isCreatingLocalFile && <Loader2 size={12} className="animate-spin" />}
                {t("workspace.sidebar.createLocalFile")}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={localFolderActionDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeLocalFolderActionDialog();
          }}
        >
          <DialogContent className="app-modal-shell max-w-[520px] rounded-[16px] p-0">
            <DialogTitle className="border-b border-[var(--app-border)] px-5 py-4 text-[16px] font-semibold text-[var(--app-text)]">
              {localFolderActionMode === "rename"
                ? t("workspace.sidebar.renameRepositoryEntry")
                : t("workspace.sidebar.moveRepositoryEntry")}
            </DialogTitle>
            <div className="space-y-3 px-5 py-4">
              <div className="text-xs text-[var(--app-text-soft)]">
                {localFolderActionMode === "rename"
                  ? t("workspace.sidebar.renameRepositoryEntryTip", { target: localFolderFromPath })
                  : t("workspace.sidebar.moveRepositoryEntryTip", { target: localFolderFromPath })}
              </div>
              <input
                value={localFolderActionInput}
                onChange={(event) => setLocalFolderActionInput(event.target.value)}
                placeholder={
                  localFolderActionMode === "rename"
                    ? t("workspace.sidebar.renameRepositoryEntryPlaceholder")
                    : t("workspace.sidebar.moveRepositoryEntryPlaceholder")
                }
                className="app-input h-[44px] px-3 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
              <button
                onClick={closeLocalFolderActionDialog}
                className="app-btn-neutral inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-3 text-xs"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={() => void applyLocalFolderAction()}
                disabled={isApplyingLocalFolderAction}
                className="app-btn-primary inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-button)] px-3 text-xs font-semibold disabled:opacity-60"
              >
                {isApplyingLocalFolderAction && <Loader2 size={12} className="animate-spin" />}
                {localFolderActionMode === "rename"
                  ? t("workspace.documentActions.rename")
                  : t("workspace.documentActions.move")}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={localFolderDeleteConfirmOpen}
          onOpenChange={(open) => {
            if (!open) cancelDeleteLocalFolder();
          }}
        >
          <DialogContent
            showCloseButton={true}
            className="app-modal-shell !w-[min(360px,calc(100vw-2rem))] !max-w-[360px] overflow-hidden rounded-[12px] px-5 py-4 [&_[data-slot='dialog-close']]:right-3 [&_[data-slot='dialog-close']]:top-3 [&_[data-slot='dialog-close']]:h-7 [&_[data-slot='dialog-close']]:w-7 [&_[data-slot='dialog-close']]:rounded-[8px] [&_[data-slot='dialog-close']]:shadow-none"
          >
            <DialogTitle className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--app-text)]">
              {t("workspace.sidebar.deleteRepositoryEntry")}
            </DialogTitle>
            <div className="mt-2 text-[14px] leading-6 text-[var(--app-text-soft)]">
              {t("workspace.sidebar.deleteRepositoryEntryTip", {
                target: localFolderDeleteTargetPath,
              })}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={cancelDeleteLocalFolder}
                className="app-btn-neutral flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-button)] text-[14px] font-medium transition"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={() => void confirmDeleteLocalFolder()}
                disabled={isDeletingLocalFolder}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[11px] bg-[var(--app-accent)] text-[14px] font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:opacity-60"
              >
                {isDeletingLocalFolder ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  t("workspace.documentActions.delete")
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={newLocalFolderDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeCreateLocalFolderDialog();
          }}
        >
          <DialogContent className="app-modal-shell max-w-[520px] rounded-[16px] p-0">
            <DialogTitle className="border-b border-[var(--app-border)] px-5 py-4 text-[16px] font-semibold text-[var(--app-text)]">
              {t("workspace.sidebar.createLocalFolder")}
            </DialogTitle>
            <div className="space-y-3 px-5 py-4">
              <div className="text-xs text-[var(--app-text-soft)]">
                {t("workspace.sidebar.createLocalFolderTip")}
              </div>
              <div className="rounded-[var(--radius-sm)] bg-[var(--app-accent-soft)] px-3 py-2 text-xs text-[var(--app-text)]">
                {t("workspace.sidebar.targetDirectoryLabel")}{" "}
                {currentLocalFolderTargetDirectory || t("workspace.documentActions.rootDirectory")}
              </div>
              <input
                value={currentLocalFolderName}
                onChange={(event) => {
                  const nextName = getRelativeLeafName(event.target.value);
                  const nextPath = currentLocalFolderTargetDirectory
                    ? `${currentLocalFolderTargetDirectory}/${nextName}`
                    : nextName;
                  setNewLocalFolderPathInput(nextPath);
                }}
                placeholder={t("workspace.sidebar.createLocalFolderPlaceholder")}
                className="app-input h-[44px] px-3 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
              <button
                onClick={closeCreateLocalFolderDialog}
                className="app-btn-neutral inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] px-3 text-xs"
              >
                {t("workspace.common.cancel")}
              </button>
              <button
                onClick={() => void handleCreateLocalFolder()}
                disabled={isCreatingLocalFolder}
                className="app-btn-primary inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-button)] px-3 text-xs font-semibold disabled:opacity-60"
              >
                {isCreatingLocalFolder && <Loader2 size={12} className="animate-spin" />}
                {t("workspace.sidebar.createRepositoryFolder")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Suspense fallback={null}>
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settingsSection={settingsSection}
          setSettingsSection={setSettingsSection}
          settingsDraft={settingsDraft}
          setSettingsDraft={setSettingsDraft}
          settingsIsDirty={settingsIsDirty}
          handleSaveSettings={handleSaveSettings}
          handleSaveSettingsInPlace={handleSaveSettingsInPlace}
          themeGroups={THEME_GROUPS}
          wechatAccountNameInput={wechatAccountNameInput}
          setWechatAccountNameInput={setWechatAccountNameInput}
          wechatAccountAppIdInput={wechatAccountAppIdInput}
          setWechatAccountAppIdInput={setWechatAccountAppIdInput}
          wechatAccountSecretInput={wechatAccountSecretInput}
          setWechatAccountSecretInput={setWechatAccountSecretInput}
          editingWechatAccountId={editingWechatAccountId}
          resetWechatAccountForm={resetWechatAccountForm}
          saveWechatAccountFromForm={saveWechatAccountFromForm}
          startEditWechatAccount={startEditWechatAccount}
          removeWechatAccount={removeWechatAccount}
          testWechatAccount={testWechatAccount}
          testingWechatAccountId={testingWechatAccountId}
          applyProxyPreset={applyProxyPreset}
          defaultWechatProxyUrl={DEFAULT_WECHAT_PROXY_URL}
          centeredNotice={settingsCenteredNotice}
          gitBrowsePrefs={gitBrowsePrefs}
          saveGitBrowsePref={(localPath, preference) =>
            setGitBrowsePrefs((prev) => ({ ...prev, [localPath]: preference }))
          }
          saveGitAuthPref={(localPath, auth) =>
            setGitAuthPrefs((prev) => ({ ...prev, [localPath]: auth }))
          }
          onGitRepositorySynced={upsertGitRepository}
          onGitRepositoryRemoved={(localPath) => {
            removeGitRepository(localPath);
            setGitBrowsePrefs((prev) => {
              const next = { ...prev };
              delete next[localPath];
              return next;
            });
            setGitAuthPrefs((prev) => {
              const next = { ...prev };
              delete next[localPath];
              return next;
            });
          }}
        />

        <CoverGeneratorDialog
          open={coverGeneratorOpen}
          onOpenChange={setCoverGeneratorOpen}
          apiEndpoint={aiLabApiEndpoint}
          apiKey={aiLabApiKey}
          model={aiLabModel}
          imageSize={aiLabImageSize}
          defaultTitle={activeDocument?.title ?? ""}
          documentContent={markdownInput}
          networkProxy={{
            enabled: proxyEnabled,
            socksProxy: socksProxy.trim(),
            httpProxy: httpProxy.trim(),
            httpsProxy: httpsProxy.trim(),
          }}
          onInsertImage={insertCoverIntoCurrentDocument}
        />
      </Suspense>

      <Dialog
        open={Boolean(deleteConfirmDocumentId)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmDocumentId(null);
        }}
      >
        <DialogContent
          showCloseButton={true}
          className="app-modal-shell !w-[min(320px,calc(100vw-2rem))] !max-w-[320px] overflow-hidden rounded-[12px] px-5 py-4 [&_[data-slot='dialog-close']]:right-3 [&_[data-slot='dialog-close']]:top-3 [&_[data-slot='dialog-close']]:h-7 [&_[data-slot='dialog-close']]:w-7 [&_[data-slot='dialog-close']]:rounded-[8px] [&_[data-slot='dialog-close']]:shadow-none"
        >
          <DialogTitle className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--app-text)]">
            {t("workspace.deleteDialog.title")}
          </DialogTitle>
          <div className="mt-2 text-[14px] leading-6 text-[var(--app-text-soft)]">
            {t("workspace.deleteDialog.descriptionPrefix")}
            {deleteConfirmDocument ? `「${deleteConfirmDocument.title}」` : ""}
            {t("workspace.deleteDialog.descriptionSuffix")}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => setDeleteConfirmDocumentId(null)}
              className="app-btn-neutral flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-button)] text-[14px] font-medium transition"
            >
              {t("workspace.deleteDialog.cancel")}
            </button>
            <button
              onClick={confirmDeleteDocument}
              className="app-btn-primary flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-button)] text-[14px] font-semibold transition"
            >
              {t("workspace.deleteDialog.confirm")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
