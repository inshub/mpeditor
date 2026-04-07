import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import { buildGitImageMarkdown } from "../lib/git-file";
import { buildMovedEntryPath } from "../lib/local-workspace-tree";
import { normalizeRelativePath } from "../lib/path";
import type {
  DraftDocument,
  GitAuthPreference,
  GitRepositorySnapshotPayload,
  WorkspaceState,
} from "../lib/workspace-types";

interface ReadGitFileResponsePayload {
  content: string;
  mimeType: string;
  isBinary: boolean;
  localFilePath: string;
}

interface SaveGitFileRequestPayload {
  localPath: string;
  filePath: string;
  content: string;
}

interface GitCommitPushRequestPayload {
  localPath: string;
  filePath: string;
  commitMessage: string;
  auth?: {
    username?: string;
    token?: string;
  };
}

interface GitCommitPushResponsePayload {
  status: "pushed" | "no_changes" | string;
  commitId?: string | null;
  branch: string;
  message: string;
}

interface GitNewFileTarget {
  localPath: string;
  repoName: string;
  branch: string;
  baseDir: string;
}

type GitEntryType = "file" | "folder";
type GitPathActionMode = "rename" | "move";

interface GitEntryActionTarget extends GitNewFileTarget {
  entryType: GitEntryType;
  fromPath: string;
}

interface GitDeleteTarget {
  localPath: string;
  entryType: GitEntryType;
  path: string;
}

interface UseGitFileActionsOptions {
  t: TFunction;
  activeGitSourceDocument: DraftDocument | null;
  activeGitLocalPath: string;
  activeGitIsImage: boolean;
  gitAuthPrefs: Record<string, GitAuthPreference>;
  workspaceDocuments: DraftDocument[];
  setWorkspace: React.Dispatch<React.SetStateAction<WorkspaceState>>;
  setActivePanel: React.Dispatch<React.SetStateAction<"editor" | "preview">>;
  isGitImagePath: (value?: string) => boolean;
  refreshGitRepositories: (localPath: string) => Promise<void>;
}

export function useGitFileActions({
  t,
  activeGitSourceDocument,
  activeGitLocalPath,
  activeGitIsImage,
  gitAuthPrefs,
  workspaceDocuments,
  setWorkspace,
  setActivePanel,
  isGitImagePath,
  refreshGitRepositories,
}: UseGitFileActionsOptions) {
  const [isSavingGitFile, setIsSavingGitFile] = useState(false);
  const [isPushingGitFile, setIsPushingGitFile] = useState(false);
  const [newGitFileDialogOpen, setNewGitFileDialogOpen] = useState(false);
  const [newGitFileTarget, setNewGitFileTarget] = useState<GitNewFileTarget | null>(null);
  const [newGitFilePathInput, setNewGitFilePathInput] = useState("");
  const [isCreatingGitFile, setIsCreatingGitFile] = useState(false);
  const [newGitFolderDialogOpen, setNewGitFolderDialogOpen] = useState(false);
  const [newGitFolderTarget, setNewGitFolderTarget] = useState<GitNewFileTarget | null>(null);
  const [newGitFolderPathInput, setNewGitFolderPathInput] = useState("");
  const [isCreatingGitFolder, setIsCreatingGitFolder] = useState(false);
  const [gitEntryActionDialogOpen, setGitEntryActionDialogOpen] = useState(false);
  const [gitPathActionMode, setGitPathActionMode] = useState<GitPathActionMode>("rename");
  const [gitEntryActionTarget, setGitEntryActionTarget] = useState<GitEntryActionTarget | null>(
    null
  );
  const [gitEntryActionInput, setGitEntryActionInput] = useState("");
  const [isApplyingGitEntryAction, setIsApplyingGitEntryAction] = useState(false);
  const [gitDeleteConfirmOpen, setGitDeleteConfirmOpen] = useState(false);
  const [gitDeleteTarget, setGitDeleteTarget] = useState<GitDeleteTarget | null>(null);
  const [isDeletingGitEntry, setIsDeletingGitEntry] = useState(false);

  const collectUpdatedPath = (
    fromPath: string,
    toPath: string,
    currentPath: string,
    entryType: GitEntryType
  ): string | null => {
    const fromPrefix = entryType === "folder" ? `${fromPath}/` : fromPath;
    if (currentPath === fromPath) {
      return toPath;
    }
    if (entryType === "folder" && currentPath.startsWith(fromPrefix)) {
      return `${toPath}/${currentPath.slice(fromPrefix.length)}`;
    }
    return null;
  };

  const updateWorkspaceDocumentsForPathMove = (
    localPath: string,
    entryType: GitEntryType,
    fromPath: string,
    toPath: string
  ) => {
    const sourcePrefix = `${localPath}::`;
    setWorkspace((prev) => ({
      ...prev,
      documents: prev.documents.map((doc) => {
        if (!doc.gitSourceKey?.startsWith(sourcePrefix) || !doc.localFilePath) {
          return doc;
        }
        const nextFilePath = collectUpdatedPath(fromPath, toPath, doc.localFilePath, entryType);
        if (!nextFilePath) return doc;
        return {
          ...doc,
          localFilePath: nextFilePath,
          gitFilePath: doc.gitFilePath
            ? (collectUpdatedPath(fromPath, toPath, doc.gitFilePath, entryType) ?? doc.gitFilePath)
            : doc.gitFilePath,
          gitSourceKey: `${localPath}::${nextFilePath}`,
        };
      }),
    }));
  };

  const removeWorkspaceDocumentsByPath = (
    localPath: string,
    entryType: GitEntryType,
    targetPath: string
  ) => {
    const sourcePrefix = `${localPath}::`;
    const isMatch = (doc: DraftDocument) => {
      if (!doc.gitSourceKey?.startsWith(sourcePrefix) || !doc.localFilePath) {
        return false;
      }
      if (entryType === "file") {
        return doc.localFilePath === targetPath;
      }
      return doc.localFilePath === targetPath || doc.localFilePath.startsWith(`${targetPath}/`);
    };
    setWorkspace((prev) => {
      const remaining = prev.documents.filter((doc) => !isMatch(doc));
      const activeStillExists = remaining.some((doc) => doc.id === prev.activeDocumentId);
      return {
        ...prev,
        documents: remaining,
        activeDocumentId: activeStillExists ? prev.activeDocumentId : (remaining[0]?.id ?? ""),
      };
    });
  };

  const handleSaveActiveGitFile = async () => {
    if (!activeGitSourceDocument || !activeGitSourceDocument.gitFilePath || !activeGitLocalPath) {
      return;
    }
    if (activeGitIsImage) {
      toast.error(t("workspace.feedback.gitBinaryFileReadonly"));
      return;
    }
    setIsSavingGitFile(true);
    try {
      await invoke("save_workspace_file", {
        request: {
          localPath: activeGitLocalPath,
          filePath: activeGitSourceDocument.gitFilePath,
          content: activeGitSourceDocument.content,
        } as SaveGitFileRequestPayload,
      });
      toast.success(
        t("workspace.feedback.gitFileSaved", {
          fileName: activeGitSourceDocument.gitFilePath.split("/").pop() ?? "",
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("workspace.feedback.gitSaveFailed", { message }));
    } finally {
      setIsSavingGitFile(false);
    }
  };

  const handleCommitAndPushActiveGitFile = async () => {
    if (!activeGitSourceDocument || !activeGitSourceDocument.gitFilePath || !activeGitLocalPath) {
      return;
    }
    if (activeGitIsImage) {
      toast.error(t("workspace.feedback.gitBinaryFileReadonly"));
      return;
    }
    setIsPushingGitFile(true);
    try {
      await invoke("save_workspace_file", {
        request: {
          localPath: activeGitLocalPath,
          filePath: activeGitSourceDocument.gitFilePath,
          content: activeGitSourceDocument.content,
        } as SaveGitFileRequestPayload,
      });

      const now = new Date();
      const commitMessage = `update: ${activeGitSourceDocument.gitFilePath} @ ${now.toISOString()}`;
      const auth = gitAuthPrefs[activeGitLocalPath];
      const response = await invoke<GitCommitPushResponsePayload>("git_commit_and_push", {
        request: {
          localPath: activeGitLocalPath,
          filePath: activeGitSourceDocument.gitFilePath,
          commitMessage,
          auth: auth?.token
            ? {
                username: auth.username || "oauth2",
                token: auth.token,
              }
            : undefined,
        } as GitCommitPushRequestPayload,
      });
      if (response.status === "no_changes") {
        toast.success(t("workspace.feedback.gitNoChangesToPush"));
      } else {
        toast.success(
          t("workspace.feedback.gitPushSuccess", {
            branch: response.branch || activeGitSourceDocument.gitBranch || "unknown",
          })
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("workspace.feedback.gitPushFailed", { message }));
    } finally {
      setIsPushingGitFile(false);
    }
  };

  const handleCreateGitFile = async () => {
    if (!newGitFileTarget) {
      toast.error(t("workspace.feedback.gitNewFileTargetMissing"));
      return;
    }

    const nextFilePath = newGitFilePathInput
      .trim()
      .replace(/\\/g, "/")
      .replace(/^[/]+/, "")
      .replace(/\/{2,}/g, "/");
    if (!nextFilePath) {
      toast.error(t("workspace.feedback.gitNewFilePathRequired"));
      return;
    }
    if (nextFilePath.includes("..") || nextFilePath.endsWith("/")) {
      toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
      return;
    }

    setIsCreatingGitFile(true);
    try {
      const fileName = nextFilePath.split("/").pop() || "new-file.md";
      const title = fileName.replace(/\.[^.]+$/, "") || "new-file";
      const initialContent = `# ${title}\n\n`;

      await invoke("create_workspace_file", {
        request: {
          localPath: newGitFileTarget.localPath,
          filePath: nextFilePath,
          content: initialContent,
        } as SaveGitFileRequestPayload,
      });

      const newDoc: DraftDocument = {
        id: `git_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: `${newGitFileTarget.repoName || "repo"}/${fileName}`,
        content: initialContent,
        updatedAt: Date.now(),
        localFilePath: nextFilePath,
        gitSourceKey: `${newGitFileTarget.localPath}::${nextFilePath}`,
        gitRepositoryName: newGitFileTarget.repoName,
        gitBranch: newGitFileTarget.branch,
        gitFilePath: nextFilePath,
      };

      setWorkspace((prev) => ({
        ...prev,
        documents: [...prev.documents, newDoc],
        activeDocumentId: newDoc.id,
      }));

      setNewGitFileDialogOpen(false);
      setNewGitFilePathInput("");
      setNewGitFileTarget(null);
      await refreshGitRepositories(newGitFileTarget.localPath);
      toast.success(t("workspace.feedback.gitNewFileCreated", { fileName }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("workspace.feedback.gitNewFileCreateFailed", { message }));
    } finally {
      setIsCreatingGitFile(false);
    }
  };

  const handleGitFileClick = async (
    repository: GitRepositorySnapshotPayload,
    filePath: string,
    fileName: string
  ) => {
    const gitSourceKey = `${repository.localPath}::${filePath}`;
    const existingDocument = workspaceDocuments.find((doc) => doc.gitSourceKey === gitSourceKey);

    // If the document is already open in memory, reuse it to preserve unsaved content
    if (existingDocument) {
      setWorkspace((prev) => ({
        ...prev,
        activeDocumentId: existingDocument.id,
      }));
      const isImage = isGitImagePath(fileName);
      setActivePanel(isImage ? "preview" : "editor");
      return;
    }
    const isImage = isGitImagePath(fileName);

    try {
      const response = await invoke<ReadGitFileResponsePayload>("read_git_file", {
        request: {
          localPath: repository.localPath,
          filePath,
        },
      });

      let content: string;
      if (response.isBinary && response.localFilePath) {
        content = await buildGitImageMarkdown(fileName, response.localFilePath);
      } else if (response.isBinary) {
        content = `[Binary file: ${fileName}]`;
      } else {
        content = response.content;
      }

      const newDoc: DraftDocument = {
        id: `git_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: `${repository.repoName}/${fileName}`,
        content,
        updatedAt: Date.now(),
        localFilePath: filePath,
        gitSourceKey,
        gitRepositoryName: repository.repoName,
        gitBranch: repository.branch,
        gitFilePath: filePath,
      };

      setWorkspace((prev) => ({
        ...prev,
        documents: [...prev.documents, newDoc],
        activeDocumentId: newDoc.id,
      }));

      setActivePanel(isImage ? "preview" : "editor");

      toast.success(t("workspace.feedback.loadedFile", { fileName }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("workspace.feedback.loadFileFailed", { message }));
    }
  };

  const handleOpenCreateGitFileDialog = (
    repository: GitRepositorySnapshotPayload,
    baseFolderPath: string
  ) => {
    const baseDir = baseFolderPath.replace(/\\/g, "/").replace(/^[/]+/, "").replace(/\/+$/, "");
    const defaultPath = baseDir ? `${baseDir}/new-file.md` : "new-file.md";
    setNewGitFileTarget({
      localPath: repository.localPath,
      repoName: repository.repoName,
      branch: repository.branch,
      baseDir,
    });
    setNewGitFilePathInput(defaultPath);
    setNewGitFileDialogOpen(true);
  };

  const closeNewGitFileDialog = () => {
    setNewGitFileDialogOpen(false);
    setNewGitFilePathInput("");
    setNewGitFileTarget(null);
  };

  const handleOpenCreateGitFolderDialog = (
    repository: GitRepositorySnapshotPayload,
    baseFolderPath: string
  ) => {
    const baseDir = baseFolderPath.replace(/\\/g, "/").replace(/^[/]+/, "").replace(/\/+$/, "");
    const defaultPath = baseDir ? `${baseDir}/new-folder` : "new-folder";
    setNewGitFolderTarget({
      localPath: repository.localPath,
      repoName: repository.repoName,
      branch: repository.branch,
      baseDir,
    });
    setNewGitFolderPathInput(defaultPath);
    setNewGitFolderDialogOpen(true);
  };

  const handleCreateGitFolder = async () => {
    if (!newGitFolderTarget) {
      toast.error(t("workspace.feedback.gitNewFileTargetMissing"));
      return;
    }

    const nextFolderPath = newGitFolderPathInput
      .trim()
      .replace(/\\/g, "/")
      .replace(/^[/]+/, "")
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/, "");
    if (!nextFolderPath || nextFolderPath.includes("..")) {
      toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
      return;
    }

    setIsCreatingGitFolder(true);
    try {
      await invoke("create_workspace_folder", {
        request: {
          localPath: newGitFolderTarget.localPath,
          folderPath: nextFolderPath,
        },
      });
      setNewGitFolderDialogOpen(false);
      setNewGitFolderPathInput("");
      setNewGitFolderTarget(null);
      await refreshGitRepositories(newGitFolderTarget.localPath);
      toast.success(t("workspace.feedback.gitFolderCreated", { fileName: nextFolderPath }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("workspace.feedback.gitNewFileCreateFailed", { message }));
    } finally {
      setIsCreatingGitFolder(false);
    }
  };

  const closeNewGitFolderDialog = () => {
    setNewGitFolderDialogOpen(false);
    setNewGitFolderPathInput("");
    setNewGitFolderTarget(null);
  };

  const closeGitEntryActionDialog = () => {
    setGitEntryActionDialogOpen(false);
    setGitEntryActionTarget(null);
    setGitEntryActionInput("");
    setGitPathActionMode("rename");
  };

  const openRenameGitEntryDialog = (
    repository: GitRepositorySnapshotPayload,
    entryType: GitEntryType,
    fromPath: string
  ) => {
    const normalizedFromPath = normalizeRelativePath(fromPath);
    const currentName = normalizedFromPath.split("/").pop() || "";
    setGitEntryActionTarget({
      localPath: repository.localPath,
      repoName: repository.repoName,
      branch: repository.branch,
      baseDir: normalizedFromPath.includes("/")
        ? normalizedFromPath.slice(0, normalizedFromPath.lastIndexOf("/"))
        : "",
      entryType,
      fromPath: normalizedFromPath,
    });
    setGitPathActionMode("rename");
    setGitEntryActionInput(currentName);
    setGitEntryActionDialogOpen(true);
  };

  const openMoveGitEntryDialog = (
    repository: GitRepositorySnapshotPayload,
    entryType: GitEntryType,
    fromPath: string
  ) => {
    const normalizedFromPath = normalizeRelativePath(fromPath);
    setGitEntryActionTarget({
      localPath: repository.localPath,
      repoName: repository.repoName,
      branch: repository.branch,
      baseDir: normalizedFromPath.includes("/")
        ? normalizedFromPath.slice(0, normalizedFromPath.lastIndexOf("/"))
        : "",
      entryType,
      fromPath: normalizedFromPath,
    });
    setGitPathActionMode("move");
    setGitEntryActionInput(normalizedFromPath);
    setGitEntryActionDialogOpen(true);
  };

  const moveGitEntryToDirectory = async (
    repository: GitRepositorySnapshotPayload,
    entryType: GitEntryType,
    fromPath: string,
    targetDirectory: string
  ) => {
    const normalizedFromPath = normalizeRelativePath(fromPath);
    const toPath = buildMovedEntryPath(normalizedFromPath, targetDirectory);
    if (
      !toPath ||
      toPath === normalizedFromPath ||
      (entryType === "folder" && toPath.startsWith(`${normalizedFromPath}/`))
    ) {
      return;
    }

    setIsApplyingGitEntryAction(true);
    try {
      await invoke("move_workspace_entry", {
        request: {
          localPath: repository.localPath,
          fromPath: normalizedFromPath,
          toPath,
        },
      });
      updateWorkspaceDocumentsForPathMove(
        repository.localPath,
        entryType,
        normalizedFromPath,
        toPath
      );
      await refreshGitRepositories(repository.localPath);
      toast.success(t("workspace.feedback.gitEntryMoved", { fileName: toPath }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("workspace.feedback.gitEntryMoveFailed", { message }));
    } finally {
      setIsApplyingGitEntryAction(false);
    }
  };

  const applyGitEntryPathAction = async () => {
    if (!gitEntryActionTarget) {
      return;
    }
    const { entryType, localPath, fromPath } = gitEntryActionTarget;
    const normalizedInput = normalizeRelativePath(gitEntryActionInput);
    let toPath = normalizedInput;
    if (gitPathActionMode === "rename") {
      if (!normalizedInput || normalizedInput.includes("/")) {
        toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
        return;
      }
      const parentPath = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
      toPath = parentPath ? `${parentPath}/${normalizedInput}` : normalizedInput;
    }
    if (!toPath || toPath.includes("..")) {
      toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
      return;
    }
    if (entryType === "file" && toPath.endsWith("/")) {
      toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
      return;
    }
    if (toPath === fromPath) {
      closeGitEntryActionDialog();
      return;
    }

    setIsApplyingGitEntryAction(true);
    try {
      await invoke("move_workspace_entry", {
        request: {
          localPath,
          fromPath,
          toPath,
        },
      });
      updateWorkspaceDocumentsForPathMove(localPath, entryType, fromPath, toPath);
      await refreshGitRepositories(localPath);
      toast.success(
        t(
          gitPathActionMode === "rename"
            ? "workspace.feedback.gitEntryRenamed"
            : "workspace.feedback.gitEntryMoved",
          {
            fileName: toPath,
          }
        )
      );
      closeGitEntryActionDialog();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("workspace.feedback.gitEntryMoveFailed", { message }));
    } finally {
      setIsApplyingGitEntryAction(false);
    }
  };

  const requestDeleteGitEntry = (
    repository: GitRepositorySnapshotPayload,
    entryType: GitEntryType,
    targetPath: string
  ) => {
    const normalizedTargetPath = normalizeRelativePath(targetPath);
    if (!normalizedTargetPath) return;
    setGitDeleteTarget({
      localPath: repository.localPath,
      entryType,
      path: normalizedTargetPath,
    });
    setGitDeleteConfirmOpen(true);
  };

  const cancelDeleteGitEntry = () => {
    setGitDeleteConfirmOpen(false);
    setGitDeleteTarget(null);
  };

  const confirmDeleteGitEntry = async () => {
    if (!gitDeleteTarget) return;
    const { localPath, entryType, path: normalizedTargetPath } = gitDeleteTarget;
    setIsDeletingGitEntry(true);
    try {
      if (entryType === "file") {
        await invoke("delete_workspace_file", {
          request: {
            localPath,
            filePath: normalizedTargetPath,
          },
        });
      } else {
        await invoke("delete_workspace_folder", {
          request: {
            localPath,
            folderPath: normalizedTargetPath,
          },
        });
      }
      removeWorkspaceDocumentsByPath(localPath, entryType, normalizedTargetPath);
      await refreshGitRepositories(localPath);
      toast.success(t("workspace.feedback.gitEntryDeleted", { fileName: normalizedTargetPath }));
      cancelDeleteGitEntry();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("workspace.feedback.gitEntryDeleteFailed", { message }));
    } finally {
      setIsDeletingGitEntry(false);
    }
  };

  return {
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
    openMoveGitEntryDialog,
    moveGitEntryToDirectory,
    applyGitEntryPathAction,
    requestDeleteGitEntry,
    cancelDeleteGitEntry,
    confirmDeleteGitEntry,
  };
}
