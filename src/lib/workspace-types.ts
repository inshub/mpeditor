export interface DraftDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  localFilePath?: string;
  gitSourceKey?: string;
  gitRepositoryName?: string;
  gitBranch?: string;
  gitFilePath?: string;
}

export interface WorkspaceState {
  documents: DraftDocument[];
  activeDocumentId: string;
}

export interface LocalWorkspaceFileNode {
  name: string;
  path: string;
}

export interface LocalWorkspaceFolderNode {
  name: string;
  path: string;
  files: LocalWorkspaceFileNode[];
  children: LocalWorkspaceFolderNode[];
}

export interface LocalWorkspaceTreeSnapshot {
  files: LocalWorkspaceFileNode[];
  folders: LocalWorkspaceFolderNode[];
}

export type LocalTreeFileNode = LocalWorkspaceFileNode;
export type LocalTreeFolderNode = LocalWorkspaceFolderNode;

export interface GitFileNode {
  name: string;
  path: string;
}

export interface GitFolderNode {
  name: string;
  path: string;
  files: GitFileNode[];
  children: GitFolderNode[];
}

export interface GitContentFolderNode {
  name: string;
  path: string;
  files: GitFileNode[];
  children: GitContentFolderNode[];
}

export interface GitRepositorySnapshotPayload {
  repoUrl: string;
  repoName: string;
  branch: string;
  localPath: string;
  isEmpty: boolean;
  files: GitFileNode[];
  folders: GitFolderNode[];
  lastSyncedAt: number;
}

export interface GitRepositoryWithContent {
  repository: GitRepositorySnapshotPayload;
  contentFiles: GitFileNode[];
  contentFolders: GitContentFolderNode[];
  totalContentCount: number;
}

export interface GitAuthPreference {
  username: string;
  token: string;
}
