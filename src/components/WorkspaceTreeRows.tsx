import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface WorkspaceTreeFileRowProps {
  depth: number;
  leading: ReactNode;
  label: ReactNode;
  actions?: ReactNode;
  onOpen: () => void;
  title?: string;
}

interface WorkspaceTreeFolderRowProps {
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  leading: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  toggleTitle?: string;
}

export function WorkspaceTreeFileRow({
  depth,
  leading,
  label,
  actions,
  onOpen,
  title,
}: WorkspaceTreeFileRowProps) {
  return (
    <div
      className="app-tree-row group flex items-center gap-2 px-2 py-2 text-sm"
      style={{ paddingLeft: `${30 + depth * 14}px` }}
    >
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={title}
        aria-label={title}
      >
        {leading}
        {label}
      </button>
      {actions}
    </div>
  );
}

export function WorkspaceTreeFolderRow({
  depth,
  expanded,
  onToggle,
  leading,
  label,
  meta,
  actions,
  toggleTitle,
}: WorkspaceTreeFolderRowProps) {
  return (
    <div
      className="app-tree-row app-tree-row-folder group flex items-center gap-1 px-2 py-1.5 text-sm font-medium"
      style={{ paddingLeft: `${6 + depth * 14}px` }}
    >
      <button
        onClick={onToggle}
        className="app-tree-toggle"
        title={toggleTitle}
        aria-label={toggleTitle}
        aria-expanded={expanded}
      >
        <ChevronRight size={12} className={expanded ? "rotate-90" : ""} />
      </button>
      {leading}
      {label}
      {meta}
      {actions}
    </div>
  );
}
