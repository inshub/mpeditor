import { File, Folder } from "lucide-react";
import type { TFunction } from "i18next";
import type { LocalTreeFileNode, LocalTreeFolderNode } from "../lib/workspace-types";
import WorkspaceTreeEntryMenu from "./WorkspaceTreeEntryMenu";
import { WorkspaceTreeFileRow, WorkspaceTreeFolderRow } from "./WorkspaceTreeRows";

export type { LocalTreeFileNode, LocalTreeFolderNode } from "../lib/workspace-types";

interface LocalContentTreeProps {
  files?: LocalTreeFileNode[];
  folders: LocalTreeFolderNode[];
  depth?: number;
  isFolderExpanded: (folderPath: string) => boolean;
  toggleFolderExpanded: (folderPath: string) => void;
  onOpenFile: (filePath: string) => void;
  onRenameFile: (filePath: string) => void;
  onMoveFile: (filePath: string, targetDirectory: string) => void;
  onDeleteFile: (filePath: string) => void;
  onRenameFolder: (folderPath: string) => void;
  onMoveFolder: (folderPath: string, targetDirectory: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onCreateFileInFolder: (folderPath: string) => void;
  onCreateFolderInFolder: (folderPath: string) => void;
  moveTargetDirectories: string[];
  actionsDisabled: boolean;
  t: TFunction;
}

export default function LocalContentTree({
  files = [],
  folders,
  depth = 0,
  isFolderExpanded,
  toggleFolderExpanded,
  onOpenFile,
  onRenameFile,
  onMoveFile,
  onDeleteFile,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onCreateFileInFolder,
  onCreateFolderInFolder,
  moveTargetDirectories,
  actionsDisabled,
  t,
}: LocalContentTreeProps) {
  return (
    <>
      {files.map((file) => (
        <WorkspaceTreeFileRow
          key={file.path}
          depth={depth}
          onOpen={() => onOpenFile(file.path)}
          leading={<File size={12} className="shrink-0 text-[var(--app-text-faint)]" />}
          label={<span className="min-w-0 flex-1 truncate">{file.name}</span>}
          actions={
            <WorkspaceTreeEntryMenu
              sourcePath={file.path}
              entryType="file"
              moveTargetDirectories={moveTargetDirectories}
              actionsDisabled={actionsDisabled}
              t={t}
              onRename={() => onRenameFile(file.path)}
              onMove={(targetDirectory) => onMoveFile(file.path, targetDirectory)}
              onDelete={() => onDeleteFile(file.path)}
              triggerClassName="app-tree-action opacity-0 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
            />
          }
        />
      ))}
      {folders.map((folder) => (
        <div key={`${folder.path}-${depth}`}>
          <WorkspaceTreeFolderRow
            depth={depth}
            expanded={isFolderExpanded(folder.path)}
            onToggle={() => toggleFolderExpanded(folder.path)}
            leading={<Folder size={12} className="shrink-0 text-[var(--app-text-faint)]" />}
            label={<span className="min-w-0 flex-1 truncate">{folder.name}</span>}
            actions={
              <WorkspaceTreeEntryMenu
                sourcePath={folder.path}
                entryType="folder"
                moveTargetDirectories={moveTargetDirectories}
                actionsDisabled={actionsDisabled}
                t={t}
                onCreateFile={() => onCreateFileInFolder(folder.path)}
                onCreateFolder={() => onCreateFolderInFolder(folder.path)}
                onRename={() => onRenameFolder(folder.path)}
                onMove={(targetDirectory) => onMoveFolder(folder.path, targetDirectory)}
                onDelete={() => onDeleteFolder(folder.path)}
                triggerClassName="app-tree-action app-tree-action-bordered opacity-0 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
              />
            }
          />
          {isFolderExpanded(folder.path) ? (
            <>
              {folder.files.map((file) => (
                <WorkspaceTreeFileRow
                  key={file.path}
                  depth={depth}
                  onOpen={() => onOpenFile(file.path)}
                  leading={<File size={12} className="shrink-0 text-[var(--app-text-faint)]" />}
                  label={<span className="min-w-0 flex-1 truncate">{file.name}</span>}
                  actions={
                    <WorkspaceTreeEntryMenu
                      sourcePath={file.path}
                      entryType="file"
                      moveTargetDirectories={moveTargetDirectories}
                      actionsDisabled={actionsDisabled}
                      t={t}
                      onRename={() => onRenameFile(file.path)}
                      onMove={(targetDirectory) => onMoveFile(file.path, targetDirectory)}
                      onDelete={() => onDeleteFile(file.path)}
                      triggerClassName="app-tree-action opacity-0 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
                    />
                  }
                />
              ))}
              {folder.children.length > 0 ? (
                <LocalContentTree
                  folders={folder.children}
                  depth={depth + 1}
                  isFolderExpanded={isFolderExpanded}
                  toggleFolderExpanded={toggleFolderExpanded}
                  onOpenFile={onOpenFile}
                  onRenameFile={onRenameFile}
                  onMoveFile={onMoveFile}
                  onDeleteFile={onDeleteFile}
                  onRenameFolder={onRenameFolder}
                  onMoveFolder={onMoveFolder}
                  onDeleteFolder={onDeleteFolder}
                  onCreateFileInFolder={onCreateFileInFolder}
                  onCreateFolderInFolder={onCreateFolderInFolder}
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
