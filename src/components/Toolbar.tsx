import {
  Copy,
  CheckCircle2,
  Smartphone,
  Tablet,
  Monitor,
  Loader2,
  Link2,
  Unlink2,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";

interface ToolbarProps {
  previewDevice: "mobile" | "tablet" | "pc";
  onDeviceChange: (device: "mobile" | "tablet" | "pc") => void;
  onCopy: () => void;
  copied: boolean;
  isCopying: boolean;
  scrollSyncEnabled: boolean;
  onToggleScrollSync: () => void;
  showDeviceSwitch?: boolean;
  showScrollSync?: boolean;
}

export default function Toolbar({
  previewDevice,
  onDeviceChange,
  onCopy,
  copied,
  isCopying,
  scrollSyncEnabled,
  onToggleScrollSync,
  showDeviceSwitch = true,
  showScrollSync = true,
}: ToolbarProps) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const hoverAnimation = prefersReducedMotion ? undefined : { scale: 1.02 };
  const tapAnimation = prefersReducedMotion ? undefined : { scale: 0.96 };
  return (
    <div className="flex max-w-[1024px] items-center justify-between px-4 py-2.5 sm:px-6">
      {showDeviceSwitch ? (
        <div className="app-segmented hidden md:flex">
          <button
            data-testid="device-mobile"
            onClick={() => onDeviceChange("mobile")}
            className={`app-segmented-item min-w-[38px] px-0 ${previewDevice === "mobile" ? "app-segmented-item-active" : ""}`}
            aria-label={t("workspace.toolbar.mobileView")}
            aria-pressed={previewDevice === "mobile"}
            title={t("workspace.toolbar.mobileView")}
          >
            <Smartphone size={15} strokeWidth={1.9} />
          </button>
          <button
            data-testid="device-tablet"
            onClick={() => onDeviceChange("tablet")}
            className={`app-segmented-item min-w-[38px] px-0 ${previewDevice === "tablet" ? "app-segmented-item-active" : ""}`}
            aria-label={t("workspace.toolbar.tabletView")}
            aria-pressed={previewDevice === "tablet"}
            title={t("workspace.toolbar.tabletView")}
          >
            <Tablet size={15} strokeWidth={1.9} />
          </button>
          <button
            data-testid="device-pc"
            onClick={() => onDeviceChange("pc")}
            className={`app-segmented-item min-w-[38px] px-0 ${previewDevice === "pc" ? "app-segmented-item-active" : ""}`}
            aria-label={t("workspace.toolbar.desktopView")}
            aria-pressed={previewDevice === "pc"}
            title={t("workspace.toolbar.desktopView")}
          >
            <Monitor size={15} strokeWidth={1.9} />
          </button>
        </div>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-4">
        {showScrollSync && (
          <motion.button
            whileHover={hoverAnimation}
            whileTap={tapAnimation}
            data-testid="scroll-sync-toggle"
            onClick={onToggleScrollSync}
            className={`app-btn-secondary btn-touchy text-compact inline-flex items-center gap-2 rounded-[var(--radius-button)] px-4 font-medium ${scrollSyncEnabled ? "app-status-badge-info border-[var(--app-border)]" : ""}`}
            aria-label={
              scrollSyncEnabled
                ? t("workspace.toolbar.disableSync")
                : t("workspace.toolbar.enableSync")
            }
            aria-pressed={scrollSyncEnabled}
            title={
              scrollSyncEnabled
                ? t("workspace.toolbar.disableSync")
                : t("workspace.toolbar.enableSync")
            }
          >
            {scrollSyncEnabled ? <Link2 size={14} /> : <Unlink2 size={14} />}
            <span className="hidden sm:inline">
              {scrollSyncEnabled ? t("workspace.footer.syncOn") : t("workspace.footer.syncOff")}
            </span>
            <span className="sm:hidden">
              {scrollSyncEnabled ? t("workspace.footer.syncOn") : t("workspace.footer.syncOff")}
            </span>
          </motion.button>
        )}

        <motion.button
          whileHover={hoverAnimation}
          whileTap={tapAnimation}
          data-testid="copy-button"
          onClick={onCopy}
          disabled={isCopying}
          className={
            copied
              ? "app-toolbar-btn app-toolbar-btn-success"
              : isCopying
                ? "app-toolbar-btn-primary cursor-not-allowed opacity-80"
                : "app-toolbar-btn-primary"
          }
        >
          {copied ? (
            <CheckCircle2 size={16} />
          ) : isCopying ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Copy size={16} />
          )}
          <span className="hidden sm:inline">
            {copied
              ? t("workspace.actions.copiedLong")
              : isCopying
                ? t("workspace.actions.packaging")
                : t("workspace.actions.copyToWechat")}
          </span>
          <span className="sm:hidden">
            {copied
              ? t("workspace.actions.copied")
              : isCopying
                ? t("workspace.actions.processing")
                : t("workspace.actions.copyShort")}
          </span>
        </motion.button>
      </div>
    </div>
  );
}
