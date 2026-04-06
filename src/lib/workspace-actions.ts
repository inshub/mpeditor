export interface WorkspaceDocumentBase {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

export interface WorkspaceStateBase<TDoc extends WorkspaceDocumentBase = WorkspaceDocumentBase> {
  documents: TDoc[];
  activeDocumentId: string;
}

export function updateActiveDocumentContent<TDoc extends WorkspaceDocumentBase>(
  workspace: WorkspaceStateBase<TDoc>,
  content: string,
  inferTitle: (content: string, fallback: string) => string
): WorkspaceStateBase<TDoc> {
  return {
    ...workspace,
    documents: workspace.documents.map((doc) =>
      doc.id === workspace.activeDocumentId
        ? ({
            ...doc,
            content,
            title: inferTitle(content, doc.title),
            updatedAt: Date.now(),
          } as TDoc)
        : doc
    ),
  };
}

export function prependDocument<TDoc extends WorkspaceDocumentBase>(
  workspace: WorkspaceStateBase<TDoc>,
  document: TDoc
): WorkspaceStateBase<TDoc> {
  return {
    documents: [document, ...workspace.documents],
    activeDocumentId: document.id,
  };
}

export function setActiveDocument<TDoc extends WorkspaceDocumentBase>(
  workspace: WorkspaceStateBase<TDoc>,
  documentId: string
): WorkspaceStateBase<TDoc> {
  return { ...workspace, activeDocumentId: documentId };
}

export function removeDocument<TDoc extends WorkspaceDocumentBase>(
  workspace: WorkspaceStateBase<TDoc>,
  documentId: string
): WorkspaceStateBase<TDoc> {
  const documents = workspace.documents.filter((doc) => doc.id !== documentId);
  if (documents.length === workspace.documents.length) return workspace;
  const activeDocumentId =
    workspace.activeDocumentId === documentId
      ? (documents[0]?.id ?? "")
      : workspace.activeDocumentId;
  return { documents, activeDocumentId };
}

export function duplicateDocument<TDoc extends WorkspaceDocumentBase>(
  workspace: WorkspaceStateBase<TDoc>,
  documentId: string,
  duplicateFactory: (source: TDoc) => TDoc
): WorkspaceStateBase<TDoc> {
  const source = workspace.documents.find((doc) => doc.id === documentId);
  if (!source) return workspace;
  const duplicated = duplicateFactory(source);
  const sourceIndex = workspace.documents.findIndex((doc) => doc.id === documentId);
  const documents = [...workspace.documents];
  documents.splice(sourceIndex + 1, 0, duplicated);
  return { documents, activeDocumentId: duplicated.id };
}

export function renameDocument<TDoc extends WorkspaceDocumentBase>(
  workspace: WorkspaceStateBase<TDoc>,
  documentId: string,
  nextTitle: string
): WorkspaceStateBase<TDoc> {
  return {
    ...workspace,
    documents: workspace.documents.map((doc) =>
      doc.id === documentId
        ? ({ ...doc, title: nextTitle.slice(0, 32), updatedAt: Date.now() } as TDoc)
        : doc
    ),
  };
}

export function reorderDocuments<TDoc extends WorkspaceDocumentBase>(
  workspace: WorkspaceStateBase<TDoc>,
  fromId: string,
  toId: string
): WorkspaceStateBase<TDoc> {
  const fromIndex = workspace.documents.findIndex((doc) => doc.id === fromId);
  const toIndex = workspace.documents.findIndex((doc) => doc.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return workspace;
  const documents = [...workspace.documents];
  const [moved] = documents.splice(fromIndex, 1);
  documents.splice(toIndex, 0, moved);
  return { ...workspace, documents };
}
