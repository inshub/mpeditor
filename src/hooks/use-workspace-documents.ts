import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  duplicateDocument,
  prependDocument,
  removeDocument,
  renameDocument,
  reorderDocuments as reorderWorkspaceDocuments,
  setActiveDocument,
  updateActiveDocumentContent,
} from "../lib/workspace-actions";
import type { DraftDocument, WorkspaceState } from "../lib/workspace-types";

export type WorkspaceDocumentState = DraftDocument;

interface UseWorkspaceDocumentsParams {
  workspace: WorkspaceState;
  setWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  inferTitle: (content: string, fallback: string) => string;
  createBlankDocument: () => WorkspaceDocumentState;
  createDocument: (title: string, content: string) => WorkspaceDocumentState;
  duplicateSuffix: string;
  onSwitchToEditor: () => void;
}

export function useWorkspaceDocuments({
  workspace,
  setWorkspace,
  inferTitle,
  createBlankDocument,
  createDocument,
  duplicateSuffix,
  onSwitchToEditor,
}: UseWorkspaceDocumentsParams) {
  const [deleteConfirmDocumentId, setDeleteConfirmDocumentId] = useState<string | null>(null);
  const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [draggingDocumentId, setDraggingDocumentId] = useState<string | null>(null);

  const updateActiveDocument = (content: string) => {
    setWorkspace((prev) => updateActiveDocumentContent(prev, content, inferTitle));
  };

  const handleCreateDocument = () => {
    const newDoc = createBlankDocument();
    setWorkspace((prev) => prependDocument(prev, newDoc));
    onSwitchToEditor();
  };

  const handleSwitchDocument = (documentId: string) => {
    setWorkspace((prev) => setActiveDocument(prev, documentId));
    onSwitchToEditor();
  };

  const handleDeleteDocument = (documentId: string) => {
    setDeleteConfirmDocumentId(documentId);
  };

  const confirmDeleteDocument = () => {
    if (!deleteConfirmDocumentId) return;
    setWorkspace((prev) => removeDocument(prev, deleteConfirmDocumentId));
    setDeleteConfirmDocumentId(null);
  };

  const deleteConfirmDocument = useMemo(
    () => workspace.documents.find((doc) => doc.id === deleteConfirmDocumentId) ?? null,
    [workspace.documents, deleteConfirmDocumentId]
  );

  const handleDuplicateDocument = (documentId: string) => {
    setWorkspace((prev) =>
      duplicateDocument(prev, documentId, (source) =>
        createDocument(`${source.title} ${duplicateSuffix}`, source.content)
      )
    );
  };

  const beginRenameDocument = (doc: WorkspaceDocumentState) => {
    setRenamingDocumentId(doc.id);
    setRenamingTitle(doc.title);
  };

  const commitRenameDocument = () => {
    if (!renamingDocumentId) return;
    const trimmedTitle = renamingTitle.trim();
    if (!trimmedTitle) {
      setRenamingDocumentId(null);
      setRenamingTitle("");
      return;
    }

    setWorkspace((prev) => renameDocument(prev, renamingDocumentId, trimmedTitle));
    setRenamingDocumentId(null);
    setRenamingTitle("");
  };

  const cancelRenameDocument = () => {
    setRenamingDocumentId(null);
    setRenamingTitle("");
  };

  const reorderDocuments = (fromId: string, toId: string) => {
    setWorkspace((prev) => reorderWorkspaceDocuments(prev, fromId, toId));
  };

  return {
    deleteConfirmDocumentId,
    setDeleteConfirmDocumentId,
    renamingDocumentId,
    renamingTitle,
    setRenamingTitle,
    draggingDocumentId,
    setDraggingDocumentId,
    updateActiveDocument,
    handleCreateDocument,
    handleSwitchDocument,
    handleDeleteDocument,
    confirmDeleteDocument,
    deleteConfirmDocument,
    handleDuplicateDocument,
    beginRenameDocument,
    commitRenameDocument,
    cancelRenameDocument,
    reorderDocuments,
  };
}
