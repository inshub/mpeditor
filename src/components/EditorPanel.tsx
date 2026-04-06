import React from "react";
import { useTranslation } from "react-i18next";
import { handleSmartPaste } from "../lib/htmlToMarkdown";

interface EditorPanelProps {
  markdownInput: string;
  onInputChange: (value: string) => void;
  onUploadClipboardImage?: (file: File, index: number, total: number) => Promise<string>;
  editorScrollRef: React.RefObject<HTMLTextAreaElement>;
  onEditorScroll: () => void;
  scrollSyncEnabled: boolean;
}

export default function EditorPanel({
  markdownInput,
  onInputChange,
  onUploadClipboardImage,
  editorScrollRef,
  onEditorScroll,
  scrollSyncEnabled,
}: EditorPanelProps) {
  const { t } = useTranslation();
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    handleSmartPaste(e, onInputChange, onUploadClipboardImage);
  };

  return (
    <div className="relative z-30 flex min-h-0 flex-1 flex-col bg-transparent">
      <div className="min-h-0 flex-1 px-5 py-4">
        <div className="app-panel-solid h-full overflow-hidden rounded-[var(--radius-lg)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,252,249,0.86))] dark:bg-[linear-gradient(180deg,rgba(30,32,38,0.95),rgba(24,26,32,0.92))]">
          <textarea
            ref={editorScrollRef}
            data-testid="editor-input"
            className="no-scrollbar text-md h-full w-full flex-1 resize-none bg-transparent p-8 font-mono leading-[1.9] text-[var(--app-text)] outline-none placeholder:text-[var(--app-text-faint)] md:p-10 md:text-lg"
            value={markdownInput}
            onChange={(e) => onInputChange(e.target.value)}
            onPaste={onPaste}
            onScroll={scrollSyncEnabled ? onEditorScroll : undefined}
            placeholder={t("workspace.editor.placeholder")}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
