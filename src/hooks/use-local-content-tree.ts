import { useMemo, useState } from "react";
import type { LocalTreeFileNode, LocalTreeFolderNode } from "../lib/workspace-types";

const filterFoldersByKeyword = (
  folders: LocalTreeFolderNode[],
  normalizedKeyword: string
): LocalTreeFolderNode[] => {
  if (!normalizedKeyword) return folders;
  return folders
    .map((folder) => {
      const selfMatched =
        folder.name.toLowerCase().includes(normalizedKeyword) ||
        folder.path.toLowerCase().includes(normalizedKeyword);
      const files = folder.files.filter(
        (file) =>
          file.name.toLowerCase().includes(normalizedKeyword) ||
          file.path.toLowerCase().includes(normalizedKeyword)
      );
      const children = filterFoldersByKeyword(folder.children, normalizedKeyword);
      if (!selfMatched && files.length === 0 && children.length === 0) return null;
      return { ...folder, files, children };
    })
    .filter((folder): folder is LocalTreeFolderNode => Boolean(folder));
};

export function useLocalContentTree(
  localWorkspaceFiles: LocalTreeFileNode[],
  localWorkspaceFolders: LocalTreeFolderNode[],
  normalizedSearch: string
) {
  const [expandedLocalFolders, setExpandedLocalFolders] = useState<Record<string, boolean>>({});

  const localRootFiles = useMemo(() => {
    if (!normalizedSearch) return localWorkspaceFiles;
    return localWorkspaceFiles.filter(
      (file) =>
        file.name.toLowerCase().includes(normalizedSearch) ||
        file.path.toLowerCase().includes(normalizedSearch)
    );
  }, [localWorkspaceFiles, normalizedSearch]);

  const localContentTree = useMemo(
    () => filterFoldersByKeyword(localWorkspaceFolders, normalizedSearch),
    [localWorkspaceFolders, normalizedSearch]
  );

  const isLocalFolderExpanded = (path: string) => expandedLocalFolders[path] ?? true;

  const toggleLocalFolderExpanded = (path: string) => {
    setExpandedLocalFolders((prev) => ({ ...prev, [path]: !(prev[path] ?? true) }));
  };

  const expandLocalFolderPath = (path: string) => {
    const segments = path
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (!segments.length) return;

    setExpandedLocalFolders((prev) => {
      const next = { ...prev };
      let current = "";

      for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment;
        next[current] = true;
      }

      return next;
    });
  };

  return {
    localRootFiles,
    localContentTree,
    isLocalFolderExpanded,
    toggleLocalFolderExpanded,
    expandLocalFolderPath,
  };
}
