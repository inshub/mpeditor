import { File, Folder } from "lucide-react";
import type { TFunction } from "i18next";
import type {
  GitContentFolderNode,
  GitFileNode,
  GitRepositorySnapshotPayload,
} from "../lib/workspace-types";
import WorkspaceTreeEntryMenu from "./WorkspaceTreeEntryMenu";
import { WorkspaceTreeFileRow, WorkspaceTreeFolderRow } from "./WorkspaceTreeRows";

interface GitContentTreeProps {
  files?: GitFileNode[];
  folders: GitContentFolderNode[];
  repository: GitRepositorySnapshotPayload;
  depth?: number;
  isGitFolderExpanded: (repository: GitRepositorySnapshotPayload, folderPath: string) => boolean;
  toggleGitFolderExpanded: (repository: GitRepositorySnapshotPayload, folderPath: string) => void;
  onRenameGitEntry: (
    repository: GitRepositorySnapshotPayload,
    entryType: "file" | "folder",
    path: string
  ) => void;
  onMoveGitEntry: (
    repository: GitRepositorySnapshotPayload,
    entryType: "file" | "folder",
    path: string,
    targetDirectory: string
  ) => void;
  onDeleteGitEntry: (
    repository: GitRepositorySnapshotPayload,
    entryType: "file" | "folder",
    path: string
  ) => void | Promise<void>;
  onCreateGitFileInFolder: (repository: GitRepositorySnapshotPayload, folderPath: string) => void;
  onCreateGitFolderInFolder: (repository: GitRepositorySnapshotPayload, folderPath: string) => void;
  onGitFileClick: (
    repository: GitRepositorySnapshotPayload,
    filePath: string,
    fileName: string
  ) => void | Promise<void>;
  countGitContentFiles: (folders: GitContentFolderNode[]) => number;
  moveTargetDirectories: string[];
  actionsDisabled: boolean;
  t: TFunction;
}

export default function GitContentTree({
  files = [],
  folders,
  repository,
  depth = 0,
  isGitFolderExpanded,
  toggleGitFolderExpanded,
  onRenameGitEntry,
  onMoveGitEntry,
  onDeleteGitEntry,
  onCreateGitFileInFolder,
  onCreateGitFolderInFolder,
  onGitFileClick,
  countGitContentFiles,
  moveTargetDirectories,
  actionsDisabled,
  t,
}: GitContentTreeProps) {
  return (
    <>
      {files.map((file) => (
        <WorkspaceTreeFileRow
          key={file.path}
          depth={depth}
          onOpen={() => onGitFileClick(repository, file.path, file.name)}
          title={t("workspace.sidebar.clickToOpen", { fileName: file.path })}
          leading={<File size={12} className="shrink-0 text-[var(--app-text-faint)]" />}
          label={<span className="min-w-0 flex-1 truncate">{file.name}</span>}
          actions={
            <WorkspaceTreeEntryMenu
              sourcePath={file.path}
              entryType="file"
              moveTargetDirectories={moveTargetDirectories}
              actionsDisabled={actionsDisabled}
              t={t}
              onRename={() => onRenameGitEntry(repository, "file", file.path)}
              onMove={(targetDirectory) =>
                onMoveGitEntry(repository, "file", file.path, targetDirectory)
              }
              onDelete={() => onDeleteGitEntry(repository, "file", file.path)}
              triggerClassName="app-tree-action opacity-0 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
            />
          }
        />
      ))}
      {folders.map((folder) => (
        <div key={`${folder.path}-${depth}`}>
          <WorkspaceTreeFolderRow
            depth={depth}
            expanded={isGitFolderExpanded(repository, folder.path)}
            onToggle={() => toggleGitFolderExpanded(repository, folder.path)}
            toggleTitle={isGitFolderExpanded(repository, folder.path) ? "Collapse" : "Expand"}
            leading={<Folder size={12} className="shrink-0 text-[var(--app-text-faint)]" />}
            label={<span className="min-w-0 flex-1 truncate">{folder.name}</span>}
            meta={<span className="app-counter-badge">{countGitContentFiles([folder])}</span>}
            actions={
              <WorkspaceTreeEntryMenu
                sourcePath={folder.path}
                entryType="folder"
                moveTargetDirectories={moveTargetDirectories}
                actionsDisabled={actionsDisabled}
                t={t}
                onCreateFile={() => onCreateGitFileInFolder(repository, folder.path)}
                onCreateFolder={() => onCreateGitFolderInFolder(repository, folder.path)}
                onRename={() => onRenameGitEntry(repository, "folder", folder.path)}
                onMove={(targetDirectory) =>
                  onMoveGitEntry(repository, "folder", folder.path, targetDirectory)
                }
                onDelete={() => onDeleteGitEntry(repository, "folder", folder.path)}
                triggerClassName="app-tree-action app-tree-action-bordered opacity-0 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
              />
            }
          />
          {isGitFolderExpanded(repository, folder.path) ? (
            <>
              {folder.files.map((file) => (
                <WorkspaceTreeFileRow
                  key={`${folder.path}/${file.name}`}
                  depth={depth}
                  onOpen={() => onGitFileClick(repository, file.path, file.name)}
                  title={t("workspace.sidebar.clickToOpen", { fileName: file.path })}
                  leading={<File size={12} className="shrink-0 text-[var(--app-text-faint)]" />}
                  label={<span className="min-w-0 flex-1 truncate">{file.name}</span>}
                  actions={
                    <WorkspaceTreeEntryMenu
                      sourcePath={file.path}
                      entryType="file"
                      moveTargetDirectories={moveTargetDirectories}
                      actionsDisabled={actionsDisabled}
                      t={t}
                      onRename={() => onRenameGitEntry(repository, "file", file.path)}
                      onMove={(targetDirectory) =>
                        onMoveGitEntry(repository, "file", file.path, targetDirectory)
                      }
                      onDelete={() => onDeleteGitEntry(repository, "file", file.path)}
                      triggerClassName="app-tree-action opacity-0 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
                    />
                  }
                />
              ))}
              {folder.children.length > 0 ? (
                <GitContentTree
                  folders={folder.children}
                  repository={repository}
                  depth={depth + 1}
                  isGitFolderExpanded={isGitFolderExpanded}
                  toggleGitFolderExpanded={toggleGitFolderExpanded}
                  onRenameGitEntry={onRenameGitEntry}
                  onMoveGitEntry={onMoveGitEntry}
                  onDeleteGitEntry={onDeleteGitEntry}
                  onCreateGitFileInFolder={onCreateGitFileInFolder}
                  onCreateGitFolderInFolder={onCreateGitFolderInFolder}
                  onGitFileClick={onGitFileClick}
                  countGitContentFiles={countGitContentFiles}
                  moveTargetDirectories={moveTargetDirectories}
                  actionsDisabled={actionsDisabled}
                  t={t}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ))}
    </>
  );
}
