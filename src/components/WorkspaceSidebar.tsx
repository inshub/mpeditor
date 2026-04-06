import { useMemo, useState } from "react";
import {
  ChevronsUpDown,
  ChevronRight,
  FilePlus2,
  FolderGit2,
  FolderPlus,
  Search,
  Settings2,
} from "lucide-react";
import type { TFunction } from "i18next";
import GitContentTree from "./GitContentTree";
import LocalContentTree, {
  type LocalTreeFileNode,
  type LocalTreeFolderNode,
} from "./LocalContentTree";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useLocalContentTree } from "../hooks/use-local-content-tree";
import type {
  DraftDocument,
  GitContentFolderNode,
  GitFileNode,
  GitRepositorySnapshotPayload,
  GitRepositoryWithContent,
} from "../lib/workspace-types";

type WorkspaceSourceMode = "local" | "repository";

interface WorkspaceSidebarProps {
  t: TFunction;
  gitRepositoriesWithContent: GitRepositoryWithContent[];
  selectedGitRepositoryEntry?: GitRepositoryWithContent;
  documentSearch: string;
  setDocumentSearch: (value: string) => void;
  visibleGitContentFiles: GitFileNode[];
  visibleGitContentFolders: GitContentFolderNode[];
  isGitFolderExpanded: (repository: GitRepositorySnapshotPayload, folderPath: string) => boolean;
  toggleGitFolderExpanded: (repository: GitRepositorySnapshotPayload, folderPath: string) => void;
  handleOpenCreateGitFileDialog: (
    repository: GitRepositorySnapshotPayload,
    folderPath: string
  ) => void;
  handleOpenCreateGitFolderDialog: (
    repository: GitRepositorySnapshotPayload,
    folderPath: string
  ) => void;
  handleRenameGitEntry: (
    repository: GitRepositorySnapshotPayload,
    entryType: "file" | "folder",
    path: string
  ) => void;
  handleMoveGitEntry: (
    repository: GitRepositorySnapshotPayload,
    entryType: "file" | "folder",
    path: string,
    targetDirectory: string
  ) => void;
  handleDeleteGitEntry: (
    repository: GitRepositorySnapshotPayload,
    entryType: "file" | "folder",
    path: string
  ) => void | Promise<void>;
  handleGitFileClick: (
    repository: GitRepositorySnapshotPayload,
    filePath: string,
    fileName: string
  ) => void | Promise<void>;
  countGitContentFiles: (folders: GitContentFolderNode[]) => number;
  actionsDisabled: boolean;
  draftsExpanded: boolean;
  setDraftsExpanded: (value: boolean | ((prev: boolean) => boolean)) => void;
  handleOpenCreateLocalFolderDialog: (baseDir: string) => void;
  localActionsDisabled: boolean;
  localWorkspaceFiles: LocalTreeFileNode[];
  localWorkspaceFolders: LocalTreeFolderNode[];
  filteredDocuments: DraftDocument[];
  handleOpenLocalFileByPath: (filePath: string) => void;
  handleDeleteLocalFileByPath: (filePath: string) => void;
  handleMoveLocalFileByPath: (filePath: string, targetDirectory: string) => void;
  handleRenameLocalFileByPath: (filePath: string) => void;
  handleRenameLocalFolder: (folderPath: string) => void;
  handleMoveLocalFolder: (folderPath: string, targetDirectory: string) => void;
  handleDeleteLocalFolder: (folderPath: string) => void;
  handleCreateLocalFileInFolder: (folderPath: string) => void;
  handleCreateLocalFolderInFolder: (folderPath: string) => void;
  openGeneralSettings: () => void;
  pendingUpdate: unknown;
  workspaceSourceMode: WorkspaceSourceMode;
  currentProjectName: string;
  activeLocalLibraryPath: string;
  recentLocalLibraryPaths: string[];
  onSelectLocalWorkspace: (path: string) => void;
  onSelectRepositoryWorkspace: (localPath: string) => void;
  onOpenRepositoryManager: () => void;
  onOpenCreateLocalFileDialog: (baseDir: string) => void;
  onOpenCreateGitFileDialogInFolder: (
    repository: GitRepositorySnapshotPayload,
    folderPath: string
  ) => void;
  onOpenCreateGitFolderDialogInFolder: (
    repository: GitRepositorySnapshotPayload,
    folderPath: string
  ) => void;
}

function LabBadge({ t }: { t: TFunction }) {
  return (
    <span className="app-status-badge app-status-badge-info h-5 shrink-0 uppercase tracking-[0.08em]">
      {t("workspace.sidebar.projectLab")}
    </span>
  );
}

export default function WorkspaceSidebar({
  t,
  gitRepositoriesWithContent,
  selectedGitRepositoryEntry,
  documentSearch,
  setDocumentSearch,
  visibleGitContentFiles,
  visibleGitContentFolders,
  isGitFolderExpanded,
  toggleGitFolderExpanded,
  handleOpenCreateGitFileDialog,
  handleOpenCreateGitFolderDialog,
  handleRenameGitEntry,
  handleMoveGitEntry,
  handleDeleteGitEntry,
  handleGitFileClick,
  countGitContentFiles,
  actionsDisabled,
  draftsExpanded,
  setDraftsExpanded,
  handleOpenCreateLocalFolderDialog,
  localActionsDisabled,
  localWorkspaceFiles,
  localWorkspaceFolders,
  filteredDocuments,
  handleOpenLocalFileByPath,
  handleDeleteLocalFileByPath,
  handleMoveLocalFileByPath,
  handleRenameLocalFileByPath,
  handleRenameLocalFolder,
  handleMoveLocalFolder,
  handleDeleteLocalFolder,
  handleCreateLocalFileInFolder,
  handleCreateLocalFolderInFolder,
  openGeneralSettings,
  pendingUpdate,
  workspaceSourceMode,
  currentProjectName,
  activeLocalLibraryPath,
  recentLocalLibraryPaths,
  onSelectLocalWorkspace,
  onSelectRepositoryWorkspace,
  onOpenRepositoryManager,
  onOpenCreateLocalFileDialog,
  onOpenCreateGitFileDialogInFolder,
  onOpenCreateGitFolderDialogInFolder,
}: WorkspaceSidebarProps) {
  const [repositoryExplorerExpanded, setRepositoryExplorerExpanded] = useState(true);
  const { localRootFiles, localContentTree, isLocalFolderExpanded, toggleLocalFolderExpanded } =
    useLocalContentTree(
      localWorkspaceFiles,
      localWorkspaceFolders,
      documentSearch.trim().toLowerCase()
    );
  const currentLocalName = useMemo(() => {
    const normalized = activeLocalLibraryPath.trim().replace(/[\\/]+$/, "");
    if (!normalized) return "";
    const segments = normalized.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? "";
  }, [activeLocalLibraryPath]);
  const isRepositoryWorkspace = workspaceSourceMode === "repository";
  const localMoveTargetDirectories = useMemo(() => {
    const collectFolderPaths = (folders: LocalTreeFolderNode[]): string[] =>
      folders.flatMap((folder) => [folder.path, ...collectFolderPaths(folder.children)]);

    return ["", ...collectFolderPaths(localWorkspaceFolders)];
  }, [localWorkspaceFolders]);
  const repositoryMoveTargetDirectories = useMemo(() => {
    const collectFolderPaths = (folders: GitContentFolderNode[]): string[] =>
      folders.flatMap((folder) => [folder.path, ...collectFolderPaths(folder.children)]);

    return ["", ...collectFolderPaths(selectedGitRepositoryEntry?.contentFolders ?? [])];
  }, [selectedGitRepositoryEntry]);
  const visibleLocalFileCount = useMemo(() => {
    const countVisibleFiles = (
      files: LocalTreeFileNode[],
      folders: LocalTreeFolderNode[]
    ): number =>
      files.length +
      folders.reduce((total, folder) => {
        const visibleChildren = isLocalFolderExpanded(folder.path)
          ? countVisibleFiles(folder.files, folder.children)
          : 0;
        return total + folder.files.length + visibleChildren;
      }, 0);

    return countVisibleFiles(localRootFiles, localContentTree);
  }, [localRootFiles, localContentTree, isLocalFolderExpanded]);
  const visibleRepositoryFileCount = useMemo(
    () => visibleGitContentFiles.length + countGitContentFiles(visibleGitContentFolders),
    [countGitContentFiles, visibleGitContentFiles, visibleGitContentFolders]
  );

  const sidebarSurfaceButtonClass = "app-sidebar-surface-button";
  const sidebarSecondaryActionButtonClass = "app-sidebar-action";
  const sidebarPrimaryActionButtonClass = "app-sidebar-action app-sidebar-action-primary";
  const sidebarSectionClass = "app-soft-panel rounded-[var(--radius-lg)] p-2.5";
  const sidebarDropdownClass = "app-popover-surface w-[250px] rounded-[var(--radius-md)] p-1.5";

  const workspaceSwitcher = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={sidebarSurfaceButtonClass}>
          <span className="relative flex h-5 w-5 shrink-0 items-center justify-center text-[var(--app-text-soft)]">
            <FolderGit2 size={15} />
          </span>
          <span className="min-w-0 flex-1 truncate text-left leading-none">
            {currentProjectName}
          </span>
          {isRepositoryWorkspace ? <LabBadge t={t} /> : null}
          <ChevronsUpDown size={13} className="shrink-0 text-[var(--app-text-faint)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={sidebarDropdownClass}>
        {currentLocalName ? (
          <DropdownMenuItem
            onSelect={() => onSelectLocalWorkspace(activeLocalLibraryPath)}
            className="text-compact rounded-[var(--radius-xs)] px-3 py-2"
          >
            {currentLocalName}
          </DropdownMenuItem>
        ) : null}
        {recentLocalLibraryPaths
          .filter((path) => path !== activeLocalLibraryPath)
          .slice(0, 5)
          .map((path) => (
            <DropdownMenuItem
              key={path}
              onSelect={() => onSelectLocalWorkspace(path)}
              className="text-compact rounded-[var(--radius-xs)] px-3 py-2"
            >
              {path.split(/[\\/]/).filter(Boolean).pop() || path}
            </DropdownMenuItem>
          ))}
        {gitRepositoriesWithContent.length > 0 ? <DropdownMenuSeparator /> : null}
        {gitRepositoriesWithContent.map(({ repository }) => (
          <DropdownMenuItem
            key={repository.localPath}
            onSelect={() => onSelectRepositoryWorkspace(repository.localPath)}
            className="text-compact flex items-center justify-between gap-2 rounded-[var(--radius-xs)] px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate">{repository.repoName}</span>
            <LabBadge t={t} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onOpenRepositoryManager}
          className="text-compact rounded-[var(--radius-xs)] px-3 py-2 font-medium"
        >
          {t("workspace.sidebar.manageWorkspace")}...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <aside className="app-sidebar-shell flex flex-col overflow-hidden px-3 py-4 transition-all">
      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.9}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)]"
        />
        <input
          value={documentSearch}
          onChange={(event) => setDocumentSearch(event.target.value)}
          aria-label={t("workspace.sidebar.searchFiles")}
          placeholder={t("workspace.sidebar.searchFiles")}
          className="app-search-input"
        />
      </div>

      <div className="thin-scrollbar mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <section className={sidebarSectionClass}>
          {workspaceSourceMode === "local" ? (
            <>
              <div className="flex items-center gap-1 px-1.5 py-1.5">
                <button
                  onClick={() => setDraftsExpanded((prev) => !prev)}
                  className="text-compact flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] text-left font-semibold text-[var(--app-text)] transition hover:text-[var(--app-text)]"
                  aria-expanded={draftsExpanded}
                >
                  <ChevronRight size={12} className={draftsExpanded ? "rotate-90" : ""} />
                  <span className="min-w-0 flex-1 truncate">{currentProjectName}</span>
                </button>
                <span className="app-counter-badge shrink-0">{visibleLocalFileCount}</span>
                <button
                  onClick={() => handleOpenCreateLocalFolderDialog("")}
                  disabled={localActionsDisabled}
                  className={sidebarSecondaryActionButtonClass}
                  aria-label={t("workspace.sidebar.createLocalFolder")}
                  title={t("workspace.sidebar.createLocalFolder")}
                >
                  <FolderPlus size={13} />
                </button>
                <button
                  onClick={() => onOpenCreateLocalFileDialog("")}
                  disabled={localActionsDisabled}
                  className={sidebarPrimaryActionButtonClass}
                  aria-label={t("workspace.sidebar.newDocument")}
                  title={t("workspace.sidebar.newDocument")}
                >
                  <FilePlus2 size={13} />
                </button>
              </div>
              {draftsExpanded ? (
                <div className="mt-1 space-y-0.5">
                  <LocalContentTree
                    files={localRootFiles}
                    folders={localContentTree}
                    isFolderExpanded={isLocalFolderExpanded}
                    toggleFolderExpanded={toggleLocalFolderExpanded}
                    onOpenFile={handleOpenLocalFileByPath}
                    onRenameFile={handleRenameLocalFileByPath}
                    onMoveFile={handleMoveLocalFileByPath}
                    onDeleteFile={handleDeleteLocalFileByPath}
                    onRenameFolder={handleRenameLocalFolder}
                    onMoveFolder={handleMoveLocalFolder}
                    onDeleteFolder={handleDeleteLocalFolder}
                    onCreateFileInFolder={handleCreateLocalFileInFolder}
                    onCreateFolderInFolder={handleCreateLocalFolderInFolder}
                    moveTargetDirectories={localMoveTargetDirectories}
                    actionsDisabled={localActionsDisabled}
                    t={t}
                  />
                  {filteredDocuments.length === 0 ? (
                    <div className="rounded-[var(--radius-sm)] px-2 py-2 text-sm text-[var(--app-text-soft)]">
                      {t("workspace.sidebar.noDocuments")}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          {workspaceSourceMode === "repository" ? (
            <div>
              <div className="flex items-center gap-1 px-1.5 py-1.5">
                <button
                  onClick={() => setRepositoryExplorerExpanded((prev) => !prev)}
                  className="text-compact flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] text-left font-semibold text-[var(--app-text)] transition hover:text-[var(--app-text)]"
                  aria-expanded={repositoryExplorerExpanded}
                >
                  <ChevronRight
                    size={12}
                    className={repositoryExplorerExpanded ? "rotate-90" : ""}
                  />
                  <span className="min-w-0 flex-1 truncate">{currentProjectName}</span>
                </button>
                <span className="app-counter-badge shrink-0">{visibleRepositoryFileCount}</span>
                <button
                  onClick={() =>
                    selectedGitRepositoryEntry
                      ? handleOpenCreateGitFolderDialog(selectedGitRepositoryEntry.repository, "")
                      : undefined
                  }
                  disabled={actionsDisabled || !selectedGitRepositoryEntry}
                  className={sidebarSecondaryActionButtonClass}
                  aria-label={t("workspace.sidebar.newRepositoryFolder")}
                  title={t("workspace.sidebar.newRepositoryFolder")}
                >
                  <FolderPlus size={13} />
                </button>
                <button
                  onClick={() =>
                    selectedGitRepositoryEntry
                      ? handleOpenCreateGitFileDialog(selectedGitRepositoryEntry.repository, "")
                      : undefined
                  }
                  disabled={actionsDisabled || !selectedGitRepositoryEntry}
                  className={sidebarPrimaryActionButtonClass}
                  aria-label={t("workspace.sidebar.newRepositoryFile")}
                  title={t("workspace.sidebar.newRepositoryFile")}
                >
                  <FilePlus2 size={13} />
                </button>
              </div>
              {repositoryExplorerExpanded ? (
                <div className="mt-1 space-y-1 px-1.5 pb-1">
                  {selectedGitRepositoryEntry ? (
                    <div className="space-y-0.5">
                      {visibleGitContentFiles.length > 0 || visibleGitContentFolders.length > 0 ? (
                        <GitContentTree
                          files={visibleGitContentFiles}
                          folders={visibleGitContentFolders}
                          repository={selectedGitRepositoryEntry.repository}
                          isGitFolderExpanded={isGitFolderExpanded}
                          toggleGitFolderExpanded={toggleGitFolderExpanded}
                          onRenameGitEntry={handleRenameGitEntry}
                          onMoveGitEntry={handleMoveGitEntry}
                          onDeleteGitEntry={handleDeleteGitEntry}
                          onCreateGitFileInFolder={onOpenCreateGitFileDialogInFolder}
                          onCreateGitFolderInFolder={onOpenCreateGitFolderDialogInFolder}
                          onGitFileClick={handleGitFileClick}
                          countGitContentFiles={countGitContentFiles}
                          moveTargetDirectories={repositoryMoveTargetDirectories}
                          actionsDisabled={actionsDisabled}
                          t={t}
                        />
                      ) : (
                        <div className="rounded-[var(--radius-sm)] px-2 py-2 text-sm text-[var(--app-text-soft)]">
                          {selectedGitRepositoryEntry.repository.isEmpty
                            ? t("workspace.sidebar.gitEmptyRepository")
                            : t("workspace.sidebar.gitNoFolders")}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-[var(--radius-sm)] px-2 py-2 text-sm text-[var(--app-text-soft)]">
                      {t("workspace.sidebar.gitEmpty")}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="mt-auto space-y-3 border-t border-[var(--app-border)] pt-3">
        {workspaceSwitcher}
        <button
          onClick={openGeneralSettings}
          className={sidebarSurfaceButtonClass}
          aria-label={t("settings.title")}
          title={t("settings.title")}
        >
          <span className="relative flex h-5 w-5 shrink-0 items-center justify-center text-[var(--app-text-soft)]">
            <Settings2 size={15} />
            {pendingUpdate ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
            ) : null}
          </span>
          <span className="leading-none">{t("settings.title")}</span>
        </button>
      </div>
    </aside>
  );
}
