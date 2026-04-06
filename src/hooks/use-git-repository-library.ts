import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import {
  DEFAULT_GIT_BROWSE_PREFERENCE,
  type GitBrowsePreference,
  isHiddenGitName,
  normalizeContentRoot,
} from "@/lib/gitContent";
import type {
  GitAuthPreference,
  GitFileNode,
  GitFolderNode,
  GitRepositorySnapshotPayload,
} from "../lib/workspace-types";

const GIT_CONTENT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
]);

const countVisibleGitFiles = (files: GitFileNode[]) =>
  files.filter((file) => {
    if (isHiddenGitName(file.name)) return false;
    const extension = file.name.split(".").pop()?.toLowerCase();
    return extension ? GIT_CONTENT_EXTENSIONS.has(extension) : false;
  }).length;

interface UseGitRepositoryLibraryOptions {
  t: TFunction;
  toasterId: string;
  gitBrowsePrefs: Record<string, GitBrowsePreference>;
  saveGitBrowsePref: (localPath: string, preference: GitBrowsePreference) => void;
  saveGitAuthPref: (localPath: string, auth: GitAuthPreference) => void;
  onGitRepositorySynced: (snapshot: GitRepositorySnapshotPayload) => void;
  onGitRepositoryRemoved: (localPath: string) => void;
}

export function useGitRepositoryLibrary({
  t,
  toasterId,
  gitBrowsePrefs,
  saveGitBrowsePref,
  saveGitAuthPref,
  onGitRepositorySynced,
  onGitRepositoryRemoved,
}: UseGitRepositoryLibraryOptions) {
  const [gitRepositories, setGitRepositories] = useState<GitRepositorySnapshotPayload[]>([]);
  const [syncingGitRepoId, setSyncingGitRepoId] = useState<string | null>(null);
  const [refreshingAllGitRepos, setRefreshingAllGitRepos] = useState(false);
  const [gitRepoErrors, setGitRepoErrors] = useState<Record<string, string>>({});
  const [editingGitRepoId, setEditingGitRepoId] = useState<string | null>(null);
  const [editingGitContentRoot, setEditingGitContentRoot] = useState("");
  const [editingGitIncludeMarkdown, setEditingGitIncludeMarkdown] = useState(true);
  const [editingGitIncludeImages, setEditingGitIncludeImages] = useState(true);
  const [editingGitExcludeHiddenFiles, setEditingGitExcludeHiddenFiles] = useState(true);
  const [configuringGitRemoteRepoId, setConfiguringGitRemoteRepoId] = useState<string | null>(null);
  const [configuringGitRemoteUrl, setConfiguringGitRemoteUrl] = useState("");
  const [configuringGitRemoteUsername, setConfiguringGitRemoteUsername] = useState("oauth2");
  const [configuringGitRemoteToken, setConfiguringGitRemoteToken] = useState("");
  const [savingGitRemoteRepoId, setSavingGitRemoteRepoId] = useState<string | null>(null);
  const [deletingGitRepoId, setDeletingGitRepoId] = useState<string | null>(null);

  const loadGitRepositories = useCallback(async () => {
    const repositories = await invoke<GitRepositorySnapshotPayload[]>(
      "list_synced_git_repositories"
    );
    setGitRepositories(repositories);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGitRepositories()
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {
        // Ignore error
      });
    return () => {
      cancelled = true;
    };
  }, [loadGitRepositories]);

  const upsertRepository = useCallback((snapshot: GitRepositorySnapshotPayload) => {
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

  const countContentFiles = useCallback((folders: GitFolderNode[], rootFiles: GitFileNode[] = []): number => {
    return (
      countVisibleGitFiles(rootFiles) +
      folders.reduce((total, folder) => {
        if (isHiddenGitName(folder.name)) {
          return total;
        }
        const files = countVisibleGitFiles(folder.files);
        return total + files + countContentFiles(folder.children);
      }, 0)
    );
  }, []);

  const refreshAllGitRepositories = useCallback(
    async (
      syncExistingRepository: (repository: GitRepositorySnapshotPayload) => Promise<unknown>
    ) => {
      if (gitRepositories.length === 0) {
        toast.info(t("workspace.feedback.gitNoRepositoriesToSync"), { toasterId });
        return;
      }

      setRefreshingAllGitRepos(true);
      const failures: string[] = [];
      for (const repository of gitRepositories) {
        try {
          await syncExistingRepository(repository);
        } catch {
          failures.push(repository.repoName);
        }
      }
      setRefreshingAllGitRepos(false);

      if (failures.length === 0) {
        toast.success(t("workspace.feedback.gitAllRepositoriesSynced"), { toasterId });
        return;
      }

      toast.error(
        t("workspace.feedback.gitRepositoriesSyncFailed", { names: failures.join("、") }),
        {
          toasterId,
        }
      );
    },
    [gitRepositories, toasterId]
  );

  const beginEditGitBrowsePref = useCallback(
    (repository: GitRepositorySnapshotPayload) => {
      const current = gitBrowsePrefs[repository.localPath] ?? DEFAULT_GIT_BROWSE_PREFERENCE;
      setEditingGitRepoId(repository.localPath);
      setEditingGitContentRoot(current.contentRoot);
      setEditingGitIncludeMarkdown(current.includeMarkdown);
      setEditingGitIncludeImages(current.includeImages);
      setEditingGitExcludeHiddenFiles(current.excludeHiddenFiles);
    },
    [gitBrowsePrefs]
  );

  const saveEditingGitBrowsePref = useCallback(
    (repository: GitRepositorySnapshotPayload) => {
      saveGitBrowsePref(repository.localPath, {
        contentRoot: normalizeContentRoot(editingGitContentRoot),
        includeMarkdown: editingGitIncludeMarkdown,
        includeImages: editingGitIncludeImages,
        excludeHiddenFiles: editingGitExcludeHiddenFiles,
      });
      setEditingGitRepoId(null);
      toast.success(
        t("workspace.feedback.gitBrowseStrategyUpdated", { name: repository.repoName }),
        {
          toasterId,
        }
      );
    },
    [
      editingGitContentRoot,
      editingGitExcludeHiddenFiles,
      editingGitIncludeImages,
      editingGitIncludeMarkdown,
      saveGitBrowsePref,
      toasterId,
    ]
  );

  const removeGitRepository = useCallback(
    async (repository: GitRepositorySnapshotPayload) => {
      setDeletingGitRepoId(repository.localPath);
      try {
        await invoke("delete_synced_git_repository", {
          request: { localPath: repository.localPath },
        });
        setGitRepositories((prev) =>
          prev.filter((item) => item.localPath !== repository.localPath)
        );
        onGitRepositoryRemoved(repository.localPath);
        if (editingGitRepoId === repository.localPath) {
          setEditingGitRepoId(null);
        }
        if (configuringGitRemoteRepoId === repository.localPath) {
          setConfiguringGitRemoteRepoId(null);
          setConfiguringGitRemoteUrl("");
          setConfiguringGitRemoteUsername("oauth2");
          setConfiguringGitRemoteToken("");
        }
        toast.success(t("workspace.feedback.gitRepositoryRemoved", { name: repository.repoName }), {
          toasterId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(t("workspace.feedback.gitRepositoryRemoveFailed", { message }), { toasterId });
      } finally {
        setDeletingGitRepoId(null);
      }
    },
    [configuringGitRemoteRepoId, editingGitRepoId, onGitRepositoryRemoved, toasterId]
  );

  const beginConfigureGitRemote = useCallback((repository: GitRepositorySnapshotPayload) => {
    setConfiguringGitRemoteRepoId(repository.localPath);
    setConfiguringGitRemoteUrl(repository.repoUrl);
    setConfiguringGitRemoteUsername("oauth2");
    setConfiguringGitRemoteToken("");
  }, []);

  const cancelConfigureGitRemote = useCallback(() => {
    setConfiguringGitRemoteRepoId(null);
    setConfiguringGitRemoteUrl("");
    setConfiguringGitRemoteUsername("oauth2");
    setConfiguringGitRemoteToken("");
  }, []);

  const saveGitRemoteConfiguration = useCallback(
    async (repository: GitRepositorySnapshotPayload) => {
      const repoUrl = configuringGitRemoteUrl.trim();
      if (!repoUrl) {
        toast.error(t("workspace.settings.git.remoteUrlRequired"), { toasterId });
        return;
      }
      if (!repoUrl.startsWith("https://")) {
        toast.error(t("workspace.settings.git.httpsOnly"), { toasterId });
        return;
      }

      setSavingGitRemoteRepoId(repository.localPath);
      try {
        const auth = configuringGitRemoteToken.trim()
          ? {
              username: configuringGitRemoteUsername.trim() || "oauth2",
              token: configuringGitRemoteToken.trim(),
            }
          : undefined;

        const snapshot = await invoke<GitRepositorySnapshotPayload>(
          "configure_git_repository_remote",
          {
            request: {
              localPath: repository.localPath,
              repoUrl,
              auth,
            },
          }
        );

        if (auth?.token) {
          saveGitAuthPref(repository.localPath, {
            username: auth.username,
            token: auth.token,
          });
        }

        upsertRepository(snapshot);
        setGitRepoErrors((prev) => {
          const next = { ...prev };
          delete next[repository.localPath];
          return next;
        });
        onGitRepositorySynced(snapshot);
        cancelConfigureGitRemote();
        toast.success(t("workspace.settings.git.remoteSaveSuccess"), { toasterId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(t("workspace.settings.git.remoteSaveFailed", { message }), { toasterId });
      } finally {
        setSavingGitRemoteRepoId(null);
      }
    },
    [
      cancelConfigureGitRemote,
      configuringGitRemoteToken,
      configuringGitRemoteUrl,
      configuringGitRemoteUsername,
      onGitRepositorySynced,
      saveGitAuthPref,
      t,
      toasterId,
      upsertRepository,
    ]
  );

  return {
    gitRepositories,
    syncingGitRepoId,
    setSyncingGitRepoId,
    refreshingAllGitRepos,
    gitRepoErrors,
    setGitRepoErrors,
    editingGitRepoId,
    setEditingGitRepoId,
    editingGitContentRoot,
    setEditingGitContentRoot,
    editingGitIncludeMarkdown,
    setEditingGitIncludeMarkdown,
    editingGitIncludeImages,
    setEditingGitIncludeImages,
    editingGitExcludeHiddenFiles,
    setEditingGitExcludeHiddenFiles,
    configuringGitRemoteRepoId,
    configuringGitRemoteUrl,
    setConfiguringGitRemoteUrl,
    configuringGitRemoteUsername,
    setConfiguringGitRemoteUsername,
    configuringGitRemoteToken,
    setConfiguringGitRemoteToken,
    savingGitRemoteRepoId,
    deletingGitRepoId,
    loadGitRepositories,
    upsertRepository,
    countContentFiles,
    refreshAllGitRepositories,
    beginEditGitBrowsePref,
    saveEditingGitBrowsePref,
    removeGitRepository,
    beginConfigureGitRemote,
    cancelConfigureGitRemote,
    saveGitRemoteConfiguration,
  };
}
