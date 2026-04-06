import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_GIT_BROWSE_PREFERENCE,
  GitBrowsePreference,
  normalizeContentRoot,
} from "@/lib/gitContent";
import type { GitAuthPreference, GitRepositorySnapshotPayload } from "../lib/workspace-types";
import { useGitRepoWizard } from "./use-git-repo-wizard";
import { useGitRepositoryLibrary } from "./use-git-repository-library";

export type { GitAuthPreference, GitRepositorySnapshotPayload } from "../lib/workspace-types";

interface UseGitRepoManagerOptions {
  proxyUrl?: string; // Reserved for future proxy support
  onGitRepositorySynced: (snapshot: GitRepositorySnapshotPayload) => void;
  onGitRepositoryRemoved: (localPath: string) => void;
  saveGitBrowsePref: (localPath: string, preference: GitBrowsePreference) => void;
  saveGitAuthPref: (localPath: string, auth: GitAuthPreference) => void;
  gitBrowsePrefs: Record<string, GitBrowsePreference>;
  toasterId?: string;
}

export function useGitRepoManager({
  proxyUrl: _proxyUrl, // Reserved for future proxy support
  onGitRepositorySynced,
  onGitRepositoryRemoved,
  saveGitBrowsePref,
  saveGitAuthPref,
  gitBrowsePrefs,
  toasterId = "settings-dialog-center",
}: UseGitRepoManagerOptions) {
  const { t } = useTranslation();
  const wizard = useGitRepoWizard({ t, toasterId });
  const library = useGitRepositoryLibrary({
    t,
    toasterId,
    gitBrowsePrefs,
    saveGitBrowsePref,
    saveGitAuthPref,
    onGitRepositorySynced,
    onGitRepositoryRemoved,
  });

  const syncGitRepository = useCallback(
    async (current?: GitRepositorySnapshotPayload) => {
      const repoUrl = (current?.repoUrl ?? wizard.gitRepoUrlInput).trim();
      const repoName = (current?.repoName ?? wizard.gitRepoNameInput).trim();
      const branchRaw = (current?.branch ?? wizard.gitRepoBranchInput).trim();
      const branch = branchRaw === "unknown" ? "" : branchRaw;

      if (!repoUrl) {
        toast.error(t("workspace.settings.git.urlRequired"), { toasterId });
        return;
      }
      if (!repoUrl.startsWith("https://")) {
        toast.error(t("workspace.settings.git.httpsOnly"), { toasterId });
        return;
      }

      const auth = current?.localPath
        ? { username: "", token: "" }
        : {
            username: wizard.gitRepoUsernameInput.trim(),
            token: wizard.gitRepoTokenInput.trim(),
          };

      const syncId = current?.localPath ?? "__new__";
      library.setSyncingGitRepoId(syncId);
      try {
        const snapshot = await invoke<GitRepositorySnapshotPayload>("sync_remote_git_repository", {
          request: {
            repoUrl,
            repoName: repoName || undefined,
            branch: branch || undefined,
            auth: auth?.token ? auth : undefined,
          },
        });

        library.upsertRepository(snapshot);
        if (current?.localPath) {
          library.setGitRepoErrors((prev) => {
            const next = { ...prev };
            delete next[current.localPath];
            return next;
          });
        }
        onGitRepositorySynced(snapshot);

        if (!current) {
          saveGitBrowsePref(snapshot.localPath, {
            contentRoot: normalizeContentRoot(wizard.gitContentRootInput),
            includeMarkdown: wizard.gitIncludeMarkdown,
            includeImages: wizard.gitIncludeImages,
            excludeHiddenFiles: wizard.gitExcludeHiddenFiles,
          });
          if (auth?.token) {
            saveGitAuthPref(snapshot.localPath, {
              username: auth.username || "oauth2",
              token: auth.token,
            });
          }
        } else if (!gitBrowsePrefs[snapshot.localPath]) {
          saveGitBrowsePref(snapshot.localPath, DEFAULT_GIT_BROWSE_PREFERENCE);
        }

        if (!current) {
          wizard.resetWizard();
        }

        toast.success(
          snapshot.isEmpty
            ? t("workspace.settings.git.syncSuccessEmpty", { name: snapshot.repoName })
            : t("workspace.settings.git.syncSuccess", { name: snapshot.repoName }),
          {
            toasterId,
          }
        );
        return snapshot;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (current?.localPath) {
          library.setGitRepoErrors((prev) => ({ ...prev, [current.localPath]: message }));
        }
        toast.error(
          t(
            message.includes("Remote branch") && message.includes("not found")
              ? "workspace.settings.git.syncFailedMissingBranch"
              : "workspace.settings.git.syncFailed",
            { message }
          ),
          { toasterId }
        );
        throw error;
      } finally {
        library.setSyncingGitRepoId(null);
      }
    },
    [
      gitBrowsePrefs,
      library,
      onGitRepositorySynced,
      saveGitBrowsePref,
      saveGitAuthPref,
      toasterId,
      t,
      wizard,
    ]
  );

  return {
    ...wizard,
    ...library,
    syncGitRepository,
    refreshAllGitRepositories: () => library.refreshAllGitRepositories(syncGitRepository),
  };
}
