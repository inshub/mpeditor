import { useEffect, useMemo, useState } from "react";
import type { GitBrowsePreference } from "../lib/gitContent";
import type {
  GitContentFolderNode,
  GitFileNode,
  GitFolderNode,
  GitRepositorySnapshotPayload,
} from "../lib/workspace-types";

interface UseGitSidebarStateOptions {
  gitRepositories: GitRepositorySnapshotPayload[];
  initialSelectedRepoLocalPath?: string;
  normalizedSearch: string;
  gitBrowsePrefs: Record<string, GitBrowsePreference>;
  defaultBrowsePreference: GitBrowsePreference;
  filterGitContentFolders: (
    folders: GitFolderNode[],
    preference: GitBrowsePreference
  ) => GitContentFolderNode[];
  filterGitContentFiles: (files: GitFileNode[], preference: GitBrowsePreference) => GitFileNode[];
  countRepositoryContentFiles: (files: GitFileNode[], folders: GitFolderNode[]) => number;
  filterGitContentFilesByKeyword: (files: GitFileNode[], keyword: string) => GitFileNode[];
  filterGitContentFoldersByKeyword: (
    folders: GitContentFolderNode[],
    keyword: string
  ) => GitContentFolderNode[];
}

export function useGitSidebarState({
  gitRepositories,
  initialSelectedRepoLocalPath = "",
  normalizedSearch,
  gitBrowsePrefs,
  defaultBrowsePreference,
  filterGitContentFolders,
  filterGitContentFiles,
  countRepositoryContentFiles,
  filterGitContentFilesByKeyword,
  filterGitContentFoldersByKeyword,
}: UseGitSidebarStateOptions) {
  const [selectedRepoLocalPath, setSelectedRepoLocalPath] = useState(initialSelectedRepoLocalPath);
  const [expandedGitFolders, setExpandedGitFolders] = useState<Record<string, boolean>>({});

  const gitRepositoriesWithContent = useMemo(
    () =>
      gitRepositories
        .map((repository) => ({
          repository,
          contentFiles: filterGitContentFiles(
            repository.files,
            gitBrowsePrefs[repository.localPath] ?? defaultBrowsePreference
          ),
          contentFolders: filterGitContentFolders(
            repository.folders,
            gitBrowsePrefs[repository.localPath] ?? defaultBrowsePreference
          ),
          totalContentCount: countRepositoryContentFiles(repository.files, repository.folders),
          browsePreference: gitBrowsePrefs[repository.localPath] ?? defaultBrowsePreference,
        })),
    [
      gitRepositories,
      gitBrowsePrefs,
      defaultBrowsePreference,
      filterGitContentFiles,
      filterGitContentFolders,
      countRepositoryContentFiles,
    ]
  );

  const selectedGitRepositoryEntry = useMemo(
    () =>
      gitRepositoriesWithContent.find(
        (entry) => entry.repository.localPath === selectedRepoLocalPath
      ) ?? gitRepositoriesWithContent[0],
    [gitRepositoriesWithContent, selectedRepoLocalPath]
  );

  const visibleGitContent = useMemo(
    () =>
      selectedGitRepositoryEntry
        ? {
            contentFiles: filterGitContentFilesByKeyword(
              selectedGitRepositoryEntry.contentFiles,
              normalizedSearch
            ),
            contentFolders: filterGitContentFoldersByKeyword(
              selectedGitRepositoryEntry.contentFolders,
              normalizedSearch
            ),
          }
        : { contentFiles: [], contentFolders: [] },
    [
      selectedGitRepositoryEntry,
      filterGitContentFilesByKeyword,
      filterGitContentFoldersByKeyword,
      normalizedSearch,
    ]
  );

  useEffect(() => {
    if (gitRepositoriesWithContent.length === 0) {
      setSelectedRepoLocalPath("");
      return;
    }
    const exists = gitRepositoriesWithContent.some(
      (entry) => entry.repository.localPath === selectedRepoLocalPath
    );
    if (!exists) {
      setSelectedRepoLocalPath(gitRepositoriesWithContent[0].repository.localPath);
    }
  }, [gitRepositoriesWithContent, selectedRepoLocalPath]);

  const makeGitFolderKey = (repository: GitRepositorySnapshotPayload, folderPath: string) =>
    `${repository.localPath}::${folderPath}`;

  const isGitFolderExpanded = (repository: GitRepositorySnapshotPayload, folderPath: string) =>
    expandedGitFolders[makeGitFolderKey(repository, folderPath)] ?? true;

  const toggleGitFolderExpanded = (
    repository: GitRepositorySnapshotPayload,
    folderPath: string
  ) => {
    const key = makeGitFolderKey(repository, folderPath);
    setExpandedGitFolders((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  return {
    selectedRepoLocalPath,
    setSelectedRepoLocalPath,
    gitRepositoriesWithContent,
    selectedGitRepositoryEntry,
    visibleGitContentFiles: visibleGitContent.contentFiles,
    visibleGitContentFolders: visibleGitContent.contentFolders,
    isGitFolderExpanded,
    toggleGitFolderExpanded,
  };
}
