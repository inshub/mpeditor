import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  Copy,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface HeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  workspaceLabel?: string;
  onExportPdf: () => void;
  onExportHtml: () => void;
  onCopy: () => void;
  copied: boolean;
  isCopying: boolean;
}

export default function Header({
  sidebarCollapsed,
  onToggleSidebar,
  workspaceLabel,
  onExportPdf,
  onExportHtml,
  onCopy,
  copied,
  isCopying,
}: HeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="app-topbar sticky top-0 z-[100] flex items-center gap-3 px-4 py-3">
      <button
        onClick={onToggleSidebar}
        className="app-icon-button h-11 w-11 rounded-[var(--radius-sm)]"
        aria-label={
          sidebarCollapsed
            ? t("workspace.header.expandSidebar")
            : t("workspace.header.collapseSidebar")
        }
        title={
          sidebarCollapsed
            ? t("workspace.header.expandSidebar")
            : t("workspace.header.collapseSidebar")
        }
      >
        {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>

      <button className="app-btn-ghost inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-base font-medium">
        <span>{workspaceLabel || t("workspace.header.workspaceMode")}</span>
        <ChevronDown size={14} className="text-[var(--app-text-faint)]" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onExportPdf}
          className="app-btn-secondary btn-touchy hidden items-center gap-1.5 rounded-[var(--radius-button)] px-3 text-xs font-medium sm:flex"
        >
          <Download size={13} />
          {t("workspace.actions.exportPdf")}
        </button>
        <button
          onClick={onExportHtml}
          className="app-btn-secondary btn-touchy hidden items-center gap-1.5 rounded-[var(--radius-button)] px-3 text-xs font-medium md:flex"
        >
          <Download size={13} />
          {t("workspace.actions.exportHtml")}
        </button>
        <button
          onClick={onCopy}
          disabled={isCopying}
          className={`btn-touchy inline-flex items-center gap-1.5 rounded-[var(--radius-button)] px-3 text-xs font-semibold text-white transition ${copied ? "app-toolbar-btn app-toolbar-btn-success" : "app-toolbar-btn-primary"} ${isCopying ? "cursor-not-allowed opacity-80" : ""}`}
        >
          {copied ? (
            <CheckCircle2 size={13} />
          ) : isCopying ? (
            <Loader2 className="animate-spin" size={13} />
          ) : (
            <Copy size={13} />
          )}
          <span>
            {copied
              ? t("workspace.actions.copied")
              : isCopying
                ? t("workspace.actions.processing")
                : t("workspace.actions.copyToWechat")}
          </span>
        </button>
      </div>
    </header>
  );
}
