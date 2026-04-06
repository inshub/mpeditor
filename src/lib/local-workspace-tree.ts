import { normalizeRelativePath } from "./path";
import type {
  LocalWorkspaceFileNode,
  LocalWorkspaceFolderNode,
  LocalWorkspaceTreeSnapshot,
} from "./workspace-types";

export const sortWorkspaceFiles = (files: LocalWorkspaceFileNode[]) =>
  [...files].sort((a, b) => a.name.localeCompare(b.name));

export const sortWorkspaceFolders = (folders: LocalWorkspaceFolderNode[]) =>
  [...folders].sort((a, b) => a.name.localeCompare(b.name));

export const insertLocalFileIntoFolders = (
  folders: LocalWorkspaceFolderNode[],
  segments: string[],
  file: LocalWorkspaceFileNode
): LocalWorkspaceFolderNode[] => {
  if (segments.length === 0) return folders;
  const [current, ...rest] = segments;
  return sortWorkspaceFolders(
    folders.map((folder) => {
      if (folder.name !== current) return folder;
      if (rest.length === 0) {
        return {
          ...folder,
          files: sortWorkspaceFiles(
            folder.files.some((entry) => entry.path === file.path)
              ? folder.files
              : [...folder.files, file]
          ),
        };
      }
      return {
        ...folder,
        children: insertLocalFileIntoFolders(folder.children, rest, file),
      };
    })
  );
};

export const removeLocalFileFromFolders = (
  folders: LocalWorkspaceFolderNode[],
  targetPath: string
): LocalWorkspaceFolderNode[] =>
  folders.map((folder) => ({
    ...folder,
    files: folder.files.filter((file) => file.path !== targetPath),
    children: removeLocalFileFromFolders(folder.children, targetPath),
  }));

export const insertLocalFolderIntoFolders = (
  folders: LocalWorkspaceFolderNode[],
  segments: string[],
  targetPath: string
): LocalWorkspaceFolderNode[] => {
  if (segments.length === 0) return folders;
  const [current, ...rest] = segments;

  if (rest.length === 0) {
    if (folders.some((folder) => folder.name === current && folder.path === targetPath)) {
      return sortWorkspaceFolders(folders);
    }
    return sortWorkspaceFolders([
      ...folders,
      {
        name: current,
        path: targetPath,
        files: [],
        children: [],
      },
    ]);
  }

  return sortWorkspaceFolders(
    folders.map((folder) => {
      if (folder.name !== current) return folder;
      return {
        ...folder,
        children: insertLocalFolderIntoFolders(folder.children, rest, targetPath),
      };
    })
  );
};

export const removeLocalFolderFromFolders = (
  folders: LocalWorkspaceFolderNode[],
  targetPath: string
): LocalWorkspaceFolderNode[] =>
  folders
    .filter((folder) => folder.path !== targetPath)
    .map((folder) => ({
      ...folder,
      children: removeLocalFolderFromFolders(folder.children, targetPath),
    }));

export const localWorkspaceTreeContainsPath = (
  tree: LocalWorkspaceTreeSnapshot,
  targetPath: string
): boolean => {
  if (tree.files.some((file) => file.path === targetPath)) {
    return true;
  }

  const visitFolders = (folders: LocalWorkspaceFolderNode[]): boolean =>
    folders.some(
      (folder) =>
        folder.path === targetPath ||
        folder.files.some((file) => file.path === targetPath) ||
        visitFolders(folder.children)
    );

  return visitFolders(tree.folders);
};

export const buildMovedEntryPath = (sourcePath: string, targetDirectory: string) => {
  const normalizedTargetDirectory = normalizeRelativePath(targetDirectory);
  const entryName = sourcePath.split("/").pop() || sourcePath;
  return normalizedTargetDirectory ? `${normalizedTargetDirectory}/${entryName}` : entryName;
};
