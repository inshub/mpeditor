import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import {
  buildMovedEntryPath,
  insertLocalFileIntoFolders,
  insertLocalFolderIntoFolders,
  localWorkspaceTreeContainsPath,
  removeLocalFileFromFolders,
  removeLocalFolderFromFolders,
  sortWorkspaceFiles,
} from "../lib/local-workspace-tree";
import { normalizeRelativePath } from "../lib/path";
import type {
  DraftDocument,
  LocalWorkspaceFileNode,
  LocalWorkspaceTreeSnapshot,
  WorkspaceState,
} from "../lib/workspace-types";

type WorkspaceSourceMode = "local" | "repository";
type LocalFolderActionMode = "rename" | "move";
type MoveDocumentMode = "rename" | "move";

interface UseLocalWorkspaceActionsOptions {
  t: TFunction;
  isTauriRuntime: () => boolean;
  workspace: WorkspaceState;
  setWorkspace: React.Dispatch<React.SetStateAction<WorkspaceState>>;
  handleSwitchDocument: (documentId: string) => void;
  handleDeleteDocument: (documentId: string) => void;
  setActivePanel: React.Dispatch<React.SetStateAction<"editor" | "preview">>;
  setDraftsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  createDocument: (title: string, content: string) => DraftDocument;
  workspaceSourceMode: WorkspaceSourceMode;
  activeLocalLibraryPath: string;
  activeWorkspaceRootPath: string;
  activeDocumentLocalFilePath?: string;
  debouncedMarkdownInput: string;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function useLocalWorkspaceActions({
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
  activeDocumentLocalFilePath,
  debouncedMarkdownInput,
}: UseLocalWorkspaceActionsOptions) {
  const [moveDocumentDialogOpen, setMoveDocumentDialogOpen] = useState(false);
  const [movingDocumentPath, setMovingDocumentPath] = useState("");
  const [moveDocumentMode, setMoveDocumentMode] = useState<MoveDocumentMode>("move");
  const [moveDocumentPathInput, setMoveDocumentPathInput] = useState("");
  const [isMovingDocument, setIsMovingDocument] = useState(false);
  const [newLocalFolderDialogOpen, setNewLocalFolderDialogOpen] = useState(false);
  const [newLocalFolderPathInput, setNewLocalFolderPathInput] = useState("new-folder");
  const [isCreatingLocalFolder, setIsCreatingLocalFolder] = useState(false);
  const [newLocalFileDialogOpen, setNewLocalFileDialogOpen] = useState(false);
  const [newLocalFilePathInput, setNewLocalFilePathInput] = useState("new-document.md");
  const [isCreatingLocalFile, setIsCreatingLocalFile] = useState(false);
  const [localFolderActionDialogOpen, setLocalFolderActionDialogOpen] = useState(false);
  const [localFolderActionMode, setLocalFolderActionMode] =
    useState<LocalFolderActionMode>("rename");
  const [localFolderFromPath, setLocalFolderFromPath] = useState("");
  const [localFolderActionInput, setLocalFolderActionInput] = useState("");
  const [isApplyingLocalFolderAction, setIsApplyingLocalFolderAction] = useState(false);
  const [localFolderDeleteConfirmOpen, setLocalFolderDeleteConfirmOpen] = useState(false);
  const [localFolderDeleteTargetPath, setLocalFolderDeleteTargetPath] = useState("");
  const [isDeletingLocalFolder, setIsDeletingLocalFolder] = useState(false);
  const [localWorkspaceTree, setLocalWorkspaceTree] = useState<LocalWorkspaceTreeSnapshot>({
    files: [],
    folders: [],
  });

  const saveLocalLibraryDocument = useCallback(
    async (localPath: string, filePath: string, content: string): Promise<void> => {
      await invoke("save_workspace_file", {
        request: {
          localPath,
          filePath,
          content,
        },
      });
    },
    []
  );

  const createLocalWorkspaceFile = useCallback(
    async (localPath: string, filePath: string, content: string): Promise<void> => {
      await invoke("create_workspace_file", {
        request: {
          localPath,
          filePath,
          content,
        },
      });
    },
    []
  );

  const deleteLocalLibraryDocument = useCallback(async (localPath: string, filePath: string) => {
    await invoke("delete_workspace_file", {
      request: {
        localPath,
        filePath,
      },
    });
  }, []);

  const refreshLocalWorkspaceTree = useCallback(
    async (localPath: string, expectedPath?: string) => {
      if (!isTauriRuntime()) {
        setLocalWorkspaceTree({ files: [], folders: [] });
        return;
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const tree = await invoke<LocalWorkspaceTreeSnapshot>("list_local_workspace_tree", {
            request: { localPath },
          });
          setLocalWorkspaceTree(tree);

          if (!expectedPath || localWorkspaceTreeContainsPath(tree, expectedPath)) {
            return;
          }
        } catch {
          if (attempt === 2) {
            setLocalWorkspaceTree({ files: [], folders: [] });
            return;
          }
        }

        await wait(120);
      }
    },
    [isTauriRuntime]
  );

  useEffect(() => {
    if (workspaceSourceMode !== "local") return;
    if (!activeLocalLibraryPath) {
      setLocalWorkspaceTree({ files: [], folders: [] });
      return;
    }
    void refreshLocalWorkspaceTree(activeLocalLibraryPath);
  }, [workspaceSourceMode, activeLocalLibraryPath, refreshLocalWorkspaceTree]);

  const addLocalFileToWorkspaceTree = useCallback((filePath: string) => {
    const normalizedPath = normalizeRelativePath(filePath, false);
    if (!normalizedPath) return;
    const segments = normalizedPath.split("/").filter(Boolean);
    const name = segments[segments.length - 1];
    const parentSegments = segments.slice(0, -1);
    const file: LocalWorkspaceFileNode = { name, path: normalizedPath };
    setLocalWorkspaceTree((prev) => {
      if (parentSegments.length === 0) {
        return {
          ...prev,
          files: sortWorkspaceFiles(
            prev.files.some((entry) => entry.path === normalizedPath)
              ? prev.files
              : [...prev.files, file]
          ),
        };
      }
      return {
        ...prev,
        folders: insertLocalFileIntoFolders(prev.folders, parentSegments, file),
      };
    });
  }, []);

  const removeLocalFileFromWorkspaceTree = useCallback((filePath: string) => {
    const normalizedPath = normalizeRelativePath(filePath, false);
    if (!normalizedPath) return;
    setLocalWorkspaceTree((prev) => ({
      files: prev.files.filter((file) => file.path !== normalizedPath),
      folders: removeLocalFileFromFolders(prev.folders, normalizedPath),
    }));
  }, []);

  const addLocalFolderToWorkspaceTree = useCallback((folderPath: string) => {
    const normalizedPath = normalizeRelativePath(folderPath);
    if (!normalizedPath) return;
    const segments = normalizedPath.split("/").filter(Boolean);
    setLocalWorkspaceTree((prev) => ({
      ...prev,
      folders: insertLocalFolderIntoFolders(prev.folders, segments, normalizedPath),
    }));
  }, []);

  const removeLocalFolderFromWorkspaceTree = useCallback((folderPath: string) => {
    const normalizedPath = normalizeRelativePath(folderPath);
    if (!normalizedPath) return;
    setLocalWorkspaceTree((prev) => ({
      files: prev.files.filter(
        (file) => file.path !== normalizedPath && !file.path.startsWith(`${normalizedPath}/`)
      ),
      folders: removeLocalFolderFromFolders(prev.folders, normalizedPath),
    }));
  }, []);

  const moveWorkspaceEntry = useCallback(
    async (localPath: string, fromPath: string, toPath: string) => {
      await invoke("move_workspace_entry", {
        request: {
          localPath,
          fromPath,
          toPath,
        },
      });
    },
    []
  );

  const closeMoveDocumentDialog = useCallback(() => {
    setMoveDocumentDialogOpen(false);
    setMovingDocumentPath("");
    setMoveDocumentMode("move");
    setMoveDocumentPathInput("");
  }, []);

  const updateLocalDocumentPath = useCallback(
    (fromPath: string, toPath: string) => {
      setWorkspace((prev) => ({
        ...prev,
        documents: prev.documents.map((doc) =>
          doc.localFilePath === fromPath
            ? {
                ...doc,
                localFilePath: toPath,
                gitFilePath: doc.gitFilePath ? toPath : doc.gitFilePath,
                gitSourceKey: doc.gitSourceKey
                  ? `${activeWorkspaceRootPath}::${toPath}`
                  : doc.gitSourceKey,
              }
            : doc
        ),
      }));
    },
    [activeWorkspaceRootPath, setWorkspace]
  );

  const updateLocalDocumentsForFolderMove = useCallback(
    (fromPath: string, toPath: string) => {
      setWorkspace((prev) => ({
        ...prev,
        documents: prev.documents.map((doc) => {
          if (!doc.localFilePath) return doc;
          const normalizedPath = doc.localFilePath.replace(/\\/g, "/");
          if (normalizedPath === fromPath || normalizedPath.startsWith(`${fromPath}/`)) {
            const suffix =
              normalizedPath === fromPath ? "" : normalizedPath.slice(fromPath.length + 1);
            const nextPath = suffix ? `${toPath}/${suffix}` : toPath;
            return {
              ...doc,
              localFilePath: nextPath,
              gitFilePath: doc.gitFilePath ? nextPath : doc.gitFilePath,
              gitSourceKey: doc.gitSourceKey
                ? `${activeWorkspaceRootPath}::${nextPath}`
                : doc.gitSourceKey,
            };
          }
          return doc;
        }),
      }));
    },
    [activeWorkspaceRootPath, setWorkspace]
  );

  const removeLocalDocumentsByFolder = useCallback(
    (folderPath: string) => {
      setWorkspace((prev) => {
        const remaining = prev.documents.filter((doc) => {
          if (!doc.localFilePath) return true;
          const normalizedPath = doc.localFilePath.replace(/\\/g, "/");
          return normalizedPath !== folderPath && !normalizedPath.startsWith(`${folderPath}/`);
        });
        const activeStillExists = remaining.some((doc) => doc.id === prev.activeDocumentId);
        return {
          ...prev,
          documents: remaining,
          activeDocumentId: activeStillExists ? prev.activeDocumentId : (remaining[0]?.id ?? ""),
        };
      });
    },
    [setWorkspace]
  );

  const openMoveDocumentDialog = useCallback(
    (fromPath: string, mode: MoveDocumentMode) => {
      const normalizedFromPath = normalizeRelativePath(fromPath);
      if (!normalizedFromPath || !activeWorkspaceRootPath) return;
      setMoveDocumentMode(mode);
      setMovingDocumentPath(normalizedFromPath);
      setMoveDocumentPathInput(
        mode === "rename"
          ? normalizedFromPath.split("/").pop() || normalizedFromPath
          : normalizedFromPath
      );
      setMoveDocumentDialogOpen(true);
    },
    [activeWorkspaceRootPath]
  );

  const applyMoveDocument = useCallback(async () => {
    if (!movingDocumentPath || !activeWorkspaceRootPath) return;
    const normalizedInput = normalizeRelativePath(moveDocumentPathInput, false);
    let nextPath = normalizedInput;
    if (moveDocumentMode === "rename") {
      if (!normalizedInput || normalizedInput.includes("/")) {
        toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
        return;
      }
      const parentPath = movingDocumentPath.includes("/")
        ? movingDocumentPath.slice(0, movingDocumentPath.lastIndexOf("/"))
        : "";
      nextPath = parentPath ? `${parentPath}/${normalizedInput}` : normalizedInput;
    }

    if (!nextPath || nextPath.includes("..")) {
      toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
      return;
    }
    if (!nextPath.toLowerCase().endsWith(".md")) {
      toast.error(t("workspace.feedback.localMarkdownOnly"));
      return;
    }
    if (nextPath === movingDocumentPath) {
      closeMoveDocumentDialog();
      return;
    }

    setIsMovingDocument(true);
    try {
      await moveWorkspaceEntry(activeWorkspaceRootPath, movingDocumentPath, nextPath);
      updateLocalDocumentPath(movingDocumentPath, nextPath);
      await refreshLocalWorkspaceTree(activeWorkspaceRootPath);
      toast.success(t("workspace.feedback.gitEntryMoved", { fileName: nextPath }));
      closeMoveDocumentDialog();
    } catch {
      toast.error(t("workspace.sidebar.localWriteFailed"));
    } finally {
      setIsMovingDocument(false);
    }
  }, [
    activeWorkspaceRootPath,
    closeMoveDocumentDialog,
    moveDocumentMode,
    moveDocumentPathInput,
    moveWorkspaceEntry,
    movingDocumentPath,
    refreshLocalWorkspaceTree,
    t,
    updateLocalDocumentPath,
  ]);

  const handleOpenLocalFileByPath = useCallback(
    (filePath: string) => {
      const normalizedPath = normalizeRelativePath(filePath, false);
      const targetDoc = workspace.documents.find((doc) => doc.localFilePath === normalizedPath);
      if (!targetDoc) return;
      handleSwitchDocument(targetDoc.id);
    },
    [handleSwitchDocument, workspace.documents]
  );

  const handleMoveLocalFileByPath = useCallback(
    async (filePath: string, targetDirectory: string) => {
      const normalizedPath = normalizeRelativePath(filePath, false);
      if (!normalizedPath || !activeWorkspaceRootPath) return;

      const nextPath = buildMovedEntryPath(normalizedPath, targetDirectory);
      if (!nextPath || nextPath === normalizedPath) return;
      if (!nextPath.toLowerCase().endsWith(".md")) {
        toast.error(t("workspace.feedback.localMarkdownOnly"));
        return;
      }

      setIsMovingDocument(true);
      try {
        await moveWorkspaceEntry(activeWorkspaceRootPath, normalizedPath, nextPath);
        updateLocalDocumentPath(normalizedPath, nextPath);
        await refreshLocalWorkspaceTree(activeWorkspaceRootPath, nextPath);
        toast.success(t("workspace.feedback.gitEntryMoved", { fileName: nextPath }));
      } catch {
        toast.error(t("workspace.sidebar.localWriteFailed"));
      } finally {
        setIsMovingDocument(false);
      }
    },
    [
      activeWorkspaceRootPath,
      moveWorkspaceEntry,
      refreshLocalWorkspaceTree,
      t,
      updateLocalDocumentPath,
    ]
  );

  const handleRenameLocalFileByPath = useCallback(
    (filePath: string) => {
      openMoveDocumentDialog(filePath, "rename");
    },
    [openMoveDocumentDialog]
  );

  const handleDeleteLocalFileByPath = useCallback(
    (filePath: string) => {
      const normalizedPath = normalizeRelativePath(filePath, false);
      const targetDoc = workspace.documents.find((doc) => doc.localFilePath === normalizedPath);
      if (!targetDoc) return;
      handleDeleteDocument(targetDoc.id);
    },
    [handleDeleteDocument, workspace.documents]
  );

  const openCreateLocalFolderDialog = useCallback((baseDir = "") => {
    const normalizedBaseDir = normalizeRelativePath(baseDir);
    setNewLocalFolderPathInput(
      normalizedBaseDir ? `${normalizedBaseDir}/new-folder` : "new-folder"
    );
    setNewLocalFolderDialogOpen(true);
  }, []);

  const closeCreateLocalFolderDialog = useCallback(() => {
    setNewLocalFolderDialogOpen(false);
    setNewLocalFolderPathInput("new-folder");
  }, []);

  const handleCreateLocalFolder = useCallback(async () => {
    if (!activeWorkspaceRootPath || workspaceSourceMode !== "local") return;
    const nextFolderPath = normalizeRelativePath(newLocalFolderPathInput);
    if (!nextFolderPath || nextFolderPath.includes("..")) {
      toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
      return;
    }
    setIsCreatingLocalFolder(true);
    try {
      await invoke("create_workspace_folder", {
        request: {
          localPath: activeWorkspaceRootPath,
          folderPath: nextFolderPath,
        },
      });
      setDraftsExpanded(true);
      addLocalFolderToWorkspaceTree(nextFolderPath);
      await refreshLocalWorkspaceTree(activeWorkspaceRootPath, nextFolderPath);
      toast.success(t("workspace.feedback.gitFolderCreated", { fileName: nextFolderPath }));
      closeCreateLocalFolderDialog();
    } catch {
      toast.error(t("workspace.sidebar.localWriteFailed"));
    } finally {
      setIsCreatingLocalFolder(false);
    }
  }, [
    activeWorkspaceRootPath,
    addLocalFolderToWorkspaceTree,
    closeCreateLocalFolderDialog,
    newLocalFolderPathInput,
    refreshLocalWorkspaceTree,
    setDraftsExpanded,
    t,
    workspaceSourceMode,
  ]);

  const openCreateLocalFileDialog = useCallback((baseDir = "") => {
    const normalizedBaseDir = normalizeRelativePath(baseDir);
    setNewLocalFilePathInput(
      normalizedBaseDir ? `${normalizedBaseDir}/new-document.md` : "new-document.md"
    );
    setNewLocalFileDialogOpen(true);
  }, []);

  const closeCreateLocalFileDialog = useCallback(() => {
    setNewLocalFileDialogOpen(false);
    setNewLocalFilePathInput("new-document.md");
  }, []);

  const handleCreateLocalFile = useCallback(async () => {
    if (!activeWorkspaceRootPath || workspaceSourceMode !== "local") return;
    const nextFilePath = normalizeRelativePath(newLocalFilePathInput, false);
    if (!nextFilePath || nextFilePath.includes("..") || nextFilePath.endsWith("/")) {
      toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
      return;
    }
    if (!nextFilePath.toLowerCase().endsWith(".md")) {
      toast.error(t("workspace.feedback.localMarkdownOnly"));
      return;
    }
    const fileName = nextFilePath.split("/").pop() || "new-document.md";
    const title = fileName.replace(/\.[^.]+$/, "") || t("workspace.sidebar.newDocument");
    const initialContent = `# ${title}\n\n`;
    setIsCreatingLocalFile(true);
    try {
      await createLocalWorkspaceFile(activeWorkspaceRootPath, nextFilePath, initialContent);
      addLocalFileToWorkspaceTree(nextFilePath);
      const newDoc: DraftDocument = {
        ...createDocument(title, initialContent),
        localFilePath: nextFilePath,
      };
      setWorkspace((prev) => ({
        documents: [newDoc, ...prev.documents],
        activeDocumentId: newDoc.id,
      }));
      await refreshLocalWorkspaceTree(activeWorkspaceRootPath);
      setActivePanel("editor");
      closeCreateLocalFileDialog();
    } catch {
      toast.error(t("workspace.sidebar.localWriteFailed"));
    } finally {
      setIsCreatingLocalFile(false);
    }
  }, [
    activeWorkspaceRootPath,
    addLocalFileToWorkspaceTree,
    closeCreateLocalFileDialog,
    createLocalWorkspaceFile,
    createDocument,
    newLocalFilePathInput,
    refreshLocalWorkspaceTree,
    setActivePanel,
    setWorkspace,
    t,
    workspaceSourceMode,
  ]);

  const openRenameLocalFolderDialog = useCallback((folderPath: string) => {
    const normalizedFromPath = normalizeRelativePath(folderPath);
    if (!normalizedFromPath) return;
    setLocalFolderActionMode("rename");
    setLocalFolderFromPath(normalizedFromPath);
    setLocalFolderActionInput(normalizedFromPath.split("/").pop() || normalizedFromPath);
    setLocalFolderActionDialogOpen(true);
  }, []);

  const openMoveLocalFolderDialog = useCallback(
    async (folderPath: string, targetDirectory: string) => {
      const normalizedFromPath = normalizeRelativePath(folderPath);
      if (!normalizedFromPath || !activeWorkspaceRootPath) return;

      const toPath = buildMovedEntryPath(normalizedFromPath, targetDirectory);
      if (!toPath || toPath === normalizedFromPath || toPath.startsWith(`${normalizedFromPath}/`)) {
        return;
      }

      setIsApplyingLocalFolderAction(true);
      try {
        await moveWorkspaceEntry(activeWorkspaceRootPath, normalizedFromPath, toPath);
        updateLocalDocumentsForFolderMove(normalizedFromPath, toPath);
        await refreshLocalWorkspaceTree(activeWorkspaceRootPath, toPath);
        toast.success(t("workspace.feedback.gitEntryMoved", { fileName: toPath }));
      } catch {
        toast.error(t("workspace.sidebar.localWriteFailed"));
      } finally {
        setIsApplyingLocalFolderAction(false);
      }
    },
    [
      activeWorkspaceRootPath,
      moveWorkspaceEntry,
      refreshLocalWorkspaceTree,
      t,
      updateLocalDocumentsForFolderMove,
    ]
  );

  const closeLocalFolderActionDialog = useCallback(() => {
    setLocalFolderActionDialogOpen(false);
    setLocalFolderFromPath("");
    setLocalFolderActionInput("");
    setLocalFolderActionMode("rename");
  }, []);

  const applyLocalFolderAction = useCallback(async () => {
    if (!activeWorkspaceRootPath || !localFolderFromPath) return;
    const normalizedInput = normalizeRelativePath(localFolderActionInput);
    let toPath = normalizedInput;
    if (localFolderActionMode === "rename") {
      if (!normalizedInput || normalizedInput.includes("/")) {
        toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
        return;
      }
      const parentPath = localFolderFromPath.includes("/")
        ? localFolderFromPath.slice(0, localFolderFromPath.lastIndexOf("/"))
        : "";
      toPath = parentPath ? `${parentPath}/${normalizedInput}` : normalizedInput;
    }
    if (!toPath || toPath.includes("..")) {
      toast.error(t("workspace.feedback.gitNewFilePathInvalid"));
      return;
    }
    if (toPath === localFolderFromPath) {
      closeLocalFolderActionDialog();
      return;
    }
    setIsApplyingLocalFolderAction(true);
    try {
      await moveWorkspaceEntry(activeWorkspaceRootPath, localFolderFromPath, toPath);
      updateLocalDocumentsForFolderMove(localFolderFromPath, toPath);
      await refreshLocalWorkspaceTree(activeWorkspaceRootPath);
      toast.success(
        t(
          localFolderActionMode === "rename"
            ? "workspace.feedback.gitEntryRenamed"
            : "workspace.feedback.gitEntryMoved",
          { fileName: toPath }
        )
      );
      closeLocalFolderActionDialog();
    } catch {
      toast.error(t("workspace.sidebar.localWriteFailed"));
    } finally {
      setIsApplyingLocalFolderAction(false);
    }
  }, [
    activeWorkspaceRootPath,
    closeLocalFolderActionDialog,
    localFolderActionInput,
    localFolderActionMode,
    localFolderFromPath,
    moveWorkspaceEntry,
    refreshLocalWorkspaceTree,
    t,
    updateLocalDocumentsForFolderMove,
  ]);

  const requestDeleteLocalFolder = useCallback((folderPath: string) => {
    const normalized = normalizeRelativePath(folderPath);
    if (!normalized) return;
    setLocalFolderDeleteTargetPath(normalized);
    setLocalFolderDeleteConfirmOpen(true);
  }, []);

  const cancelDeleteLocalFolder = useCallback(() => {
    setLocalFolderDeleteConfirmOpen(false);
    setLocalFolderDeleteTargetPath("");
  }, []);

  const confirmDeleteLocalFolder = useCallback(async () => {
    if (!activeWorkspaceRootPath || !localFolderDeleteTargetPath) return;
    setIsDeletingLocalFolder(true);
    try {
      await invoke("delete_workspace_folder", {
        request: {
          localPath: activeWorkspaceRootPath,
          folderPath: localFolderDeleteTargetPath,
        },
      });
      removeLocalFolderFromWorkspaceTree(localFolderDeleteTargetPath);
      removeLocalDocumentsByFolder(localFolderDeleteTargetPath);
      await refreshLocalWorkspaceTree(activeWorkspaceRootPath);
      toast.success(
        t("workspace.feedback.gitEntryDeleted", { fileName: localFolderDeleteTargetPath })
      );
      cancelDeleteLocalFolder();
    } catch {
      toast.error(t("workspace.sidebar.localDeleteFailed"));
    } finally {
      setIsDeletingLocalFolder(false);
    }
  }, [
    activeWorkspaceRootPath,
    cancelDeleteLocalFolder,
    localFolderDeleteTargetPath,
    refreshLocalWorkspaceTree,
    removeLocalDocumentsByFolder,
    removeLocalFolderFromWorkspaceTree,
    t,
  ]);

  const deleteLocalFileAndRefresh = useCallback(
    async (filePath: string) => {
      if (!activeWorkspaceRootPath) return;
      await deleteLocalLibraryDocument(activeWorkspaceRootPath, filePath);
      removeLocalFileFromWorkspaceTree(filePath);
      await refreshLocalWorkspaceTree(activeWorkspaceRootPath);
    },
    [
      activeWorkspaceRootPath,
      deleteLocalLibraryDocument,
      refreshLocalWorkspaceTree,
      removeLocalFileFromWorkspaceTree,
    ]
  );

  useEffect(() => {
    if (!activeWorkspaceRootPath || !activeDocumentLocalFilePath) return;
    if (!localWorkspaceTreeContainsPath(localWorkspaceTree, activeDocumentLocalFilePath)) return;
    void saveLocalLibraryDocument(
      activeWorkspaceRootPath,
      activeDocumentLocalFilePath,
      debouncedMarkdownInput
    );
  }, [
    activeDocumentLocalFilePath,
    activeWorkspaceRootPath,
    debouncedMarkdownInput,
    localWorkspaceTree,
    saveLocalLibraryDocument,
  ]);

  return {
    localWorkspaceTree,
    refreshLocalWorkspaceTree,
    saveLocalLibraryDocument,
    deleteLocalFileAndRefresh,
    moveDocumentDialogOpen,
    moveDocumentMode,
    moveDocumentPathInput,
    isMovingDocument,
    setMoveDocumentPathInput,
    openMoveDocumentDialog,
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
  };
}
