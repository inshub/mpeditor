import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import { useDebounce } from "./use-debounce";

export interface GitRepositoryAccessResponse {
  repoName: string;
  defaultBranch?: string | null;
  branches: string[];
  isEmpty: boolean;
}

interface UseGitRepoWizardOptions {
  t: TFunction;
  toasterId: string;
}

export function useGitRepoWizard({ t, toasterId }: UseGitRepoWizardOptions) {
  const [gitRepoUrlInput, setGitRepoUrlInput] = useState("");
  const [gitRepoNameInput, setGitRepoNameInput] = useState("");
  const [gitRepoBranchInput, setGitRepoBranchInput] = useState("");
  const [gitRepoUsernameInput, setGitRepoUsernameInput] = useState("oauth2");
  const [gitRepoTokenInput, setGitRepoTokenInput] = useState("");
  const [gitWizardStep, setGitWizardStep] = useState(1);
  const [gitContentRootInput, setGitContentRootInput] = useState("");
  const [gitIncludeMarkdown, setGitIncludeMarkdown] = useState(true);
  const [gitIncludeImages, setGitIncludeImages] = useState(true);
  const [gitExcludeHiddenFiles, setGitExcludeHiddenFiles] = useState(true);
  const [checkingGitAccess, setCheckingGitAccess] = useState(false);
  const [gitBranchOptions, setGitBranchOptions] = useState<string[]>([]);
  const [gitAccessChecked, setGitAccessChecked] = useState(false);

  const debouncedGitRepoUrl = useDebounce(gitRepoUrlInput, 800);

  useEffect(() => {
    const trimmedUrl = debouncedGitRepoUrl.trim();
    if (!trimmedUrl || !trimmedUrl.startsWith("https://")) {
      setGitAccessChecked(false);
      setGitBranchOptions([]);
      return;
    }

    let cancelled = false;
    const checkAccess = async () => {
      setCheckingGitAccess(true);
      try {
        const response = await invoke<GitRepositoryAccessResponse>(
          "inspect_git_repository_access",
          {
            request: {
              repoUrl: trimmedUrl,
              auth: gitRepoTokenInput.trim()
                ? {
                    username: gitRepoUsernameInput.trim() || "oauth2",
                    token: gitRepoTokenInput.trim(),
                  }
                : undefined,
            },
          }
        );

        if (cancelled) return;
        if (!gitRepoNameInput.trim()) {
          setGitRepoNameInput(response.repoName);
        }
        if (!gitRepoBranchInput.trim() && response.defaultBranch) {
          setGitRepoBranchInput(response.defaultBranch);
        }
        setGitBranchOptions(response.branches);
        setGitAccessChecked(true);
      } catch {
        if (cancelled) return;
        setGitAccessChecked(false);
        setGitBranchOptions([]);
      } finally {
        if (!cancelled) {
          setCheckingGitAccess(false);
        }
      }
    };

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [
    debouncedGitRepoUrl,
    gitRepoBranchInput,
    gitRepoNameInput,
    gitRepoTokenInput,
    gitRepoUsernameInput,
  ]);

  const inspectGitAccess = async () => {
    const repoUrl = gitRepoUrlInput.trim();
    if (!repoUrl) {
      toast.error(t("workspace.settings.git.urlRequired"), { toasterId });
      return;
    }
    if (!repoUrl.startsWith("https://")) {
      toast.error(t("workspace.settings.git.httpsOnly"), { toasterId });
      return;
    }

    setCheckingGitAccess(true);
    try {
      const response = await invoke<GitRepositoryAccessResponse>("inspect_git_repository_access", {
        request: {
          repoUrl,
          auth: gitRepoTokenInput.trim()
            ? {
                username: gitRepoUsernameInput.trim() || "oauth2",
                token: gitRepoTokenInput.trim(),
              }
            : undefined,
        },
      });

      if (!gitRepoNameInput.trim()) {
        setGitRepoNameInput(response.repoName);
      }
      if (!gitRepoBranchInput.trim() && response.defaultBranch) {
        setGitRepoBranchInput(response.defaultBranch);
      }
      setGitBranchOptions(response.branches);
      setGitAccessChecked(true);
      toast.success(
        response.isEmpty
          ? t("workspace.feedback.gitRepositoryAccessLoadedEmpty")
          : t("workspace.feedback.gitRepositoryAccessLoaded", { count: response.branches.length }),
        {
          toasterId,
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGitAccessChecked(false);
      toast.error(t("workspace.feedback.gitRepositoryAccessFailed", { message }), { toasterId });
    } finally {
      setCheckingGitAccess(false);
    }
  };

  const resetWizard = () => {
    setGitRepoUrlInput("");
    setGitRepoNameInput("");
    setGitRepoBranchInput("");
    setGitRepoUsernameInput("oauth2");
    setGitRepoTokenInput("");
    setGitWizardStep(1);
    setGitContentRootInput("");
    setGitIncludeMarkdown(true);
    setGitIncludeImages(true);
    setGitExcludeHiddenFiles(true);
    setGitBranchOptions([]);
    setGitAccessChecked(false);
  };

  return {
    gitRepoUrlInput,
    setGitRepoUrlInput,
    gitRepoNameInput,
    setGitRepoNameInput,
    gitRepoBranchInput,
    setGitRepoBranchInput,
    gitRepoUsernameInput,
    setGitRepoUsernameInput,
    gitRepoTokenInput,
    setGitRepoTokenInput,
    gitWizardStep,
    setGitWizardStep,
    gitContentRootInput,
    setGitContentRootInput,
    gitIncludeMarkdown,
    setGitIncludeMarkdown,
    gitIncludeImages,
    setGitIncludeImages,
    gitExcludeHiddenFiles,
    setGitExcludeHiddenFiles,
    checkingGitAccess,
    gitBranchOptions,
    gitAccessChecked,
    inspectGitAccess,
    resetWizard,
  };
}
