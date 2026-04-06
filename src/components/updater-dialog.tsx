import { Download, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useUpdater } from "@/hooks/use-updater";
import type { UpdaterNetworkOptions } from "@/lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";
import type { UpdateProgress } from "@/lib/updater";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";
import appLogo from "@/assets/logo.png";

interface UpdaterDialogProps {
  manualCheck?: boolean;
  onCheckComplete?: () => void;
  proxyUrl?: string;
  // External state for better control
  externalUpdate?: Update | null;
  externalChecking?: boolean;
  externalDownloading?: boolean;
  externalProgress?: UpdateProgress | null;
  externalCheckError?: string | null;
  externalCheckUpdate?: () => Promise<{
    update: Update | null;
    error: string | null;
    errorType: "plugin-not-found" | "unknown" | null;
  }>;
  externalInstallUpdate?: () => Promise<void>;
}

export function UpdaterDialog({
  manualCheck = false,
  onCheckComplete,
  proxyUrl,
  externalUpdate,
  externalChecking,
  externalDownloading,
  externalProgress,
  externalCheckError,
  externalCheckUpdate,
  externalInstallUpdate,
}: UpdaterDialogProps) {
  const updaterOptions: UpdaterNetworkOptions | undefined = proxyUrl
    ? { proxy: proxyUrl }
    : undefined;
  const internalUpdater = useUpdater(updaterOptions);

  // Use external state if provided, otherwise fall back to internal state
  const update = externalUpdate ?? internalUpdater.update;
  const checking = externalChecking ?? internalUpdater.checking;
  const downloading = externalDownloading ?? internalUpdater.downloading;
  const progress = externalProgress ?? internalUpdater.progress;
  const checkError = externalCheckError ?? internalUpdater.checkError;
  const checkUpdate = externalCheckUpdate ?? internalUpdater.checkUpdate;
  const installUpdate = externalInstallUpdate ?? internalUpdater.installUpdate;

  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!manualCheck) {
      // Auto check for updates on mount
      checkUpdate();
    }
  }, [manualCheck]);

  useEffect(() => {
    if (update) {
      setOpen(true);
      onCheckComplete?.();
    } else if (manualCheck && !checking) {
      onCheckComplete?.();
    }
  }, [update, checking, manualCheck, onCheckComplete]);

  const handleInstall = () => {
    installUpdate();
  };

  const handleCancel = () => {
    setOpen(false);
  };

  const progressPercentage = useMemo(() => {
    if (!progress) return 0;
    const { downloadedBytes, contentLength } = progress.data || {};
    if (!contentLength) return progress.event === "Finished" ? 100 : 0;
    return Math.min(100, Math.round(((downloadedBytes ?? 0) / contentLength) * 100));
  }, [progress]);

  const progressText = useMemo(() => {
    if (!progress?.data?.contentLength) {
      return t("updater.preparingDownload");
    }

    return t("updater.downloadProgress", {
      percent: progressPercentage,
      downloaded: formatBytes(progress.data.downloadedBytes ?? 0),
      total: formatBytes(progress.data.contentLength),
    });
  }, [progress, progressPercentage, t]);

  const isFinished = progress?.event === "Finished";
  const [installed, setInstalled] = useState(false);

  // When download finishes, mark as installed
  useEffect(() => {
    if (isFinished && !downloading) {
      setInstalled(true);
    }
  }, [isFinished, downloading]);

  const handleRestart = async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={!downloading && !installed}
        className="app-modal-shell max-w-[700px] overflow-hidden rounded-[var(--radius-2xl)] p-0 [&_[data-slot='dialog-close']]:right-5 [&_[data-slot='dialog-close']]:top-5 [&_[data-slot='dialog-close']]:h-10 [&_[data-slot='dialog-close']]:w-10 [&_[data-slot='dialog-close']]:rounded-[var(--radius-button)] [&_[data-slot='dialog-close']]:border-transparent [&_[data-slot='dialog-close']]:bg-transparent [&_[data-slot='dialog-close']]:text-[var(--app-text-faint)] [&_[data-slot='dialog-close']]:shadow-none"
      >
        {installed ? (
          <div className="relative px-8 py-10 sm:px-12 sm:py-12">
            <div className="app-ambient-orb pointer-events-none absolute left-1/2 top-[-96px] h-56 w-56 -translate-x-1/2 opacity-70" />
            <DialogHeader className="items-center text-center">
              <DialogTitle className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-[var(--app-text)]">
                {t("updater.readyToRestartTitle")}
              </DialogTitle>
              <DialogDescription className="mt-8 text-xl text-[var(--app-text-soft)]">
                <span>{t("updater.latestVersionLabel")}</span>
                <span className="ml-2 font-semibold text-[var(--app-accent)]">
                  {`v${update?.version ?? ""}`}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="mx-auto mt-12 max-w-[660px]">
              <DialogFooter className="flex items-center justify-center gap-4">
                <Button onClick={handleRestart}>{t("updater.restartNow")}</Button>
                <Button variant="outline" onClick={handleCancel}>
                  {t("updater.later")}
                </Button>
              </DialogFooter>
            </div>
          </div>
        ) : downloading ? (
          <div className="relative px-8 py-10 sm:px-12 sm:py-12">
            <div className="app-ambient-orb pointer-events-none absolute left-1/2 top-[-96px] h-56 w-56 -translate-x-1/2 opacity-70" />
            <DialogHeader className="items-center text-center">
              <div className="app-soft-panel-muted flex h-36 w-36 items-center justify-center rounded-full shadow-inner">
                {checking ? (
                  <Loader2 className="h-14 w-14 animate-spin text-[var(--app-text-soft)]" />
                ) : (
                  <Download className="h-14 w-14 text-[var(--app-text)]" strokeWidth={2.2} />
                )}
              </div>
              <DialogTitle className="mt-8 text-4xl font-semibold tracking-[-0.04em] text-[var(--app-text)]">
                {t("updater.downloading")}
              </DialogTitle>
              <DialogDescription className="mt-4 text-xl text-[var(--app-text-soft)]">
                {isFinished
                  ? t("updater.relaunching")
                  : t("updater.downloadingVersion", { version: update?.version ?? "" })}
              </DialogDescription>
            </DialogHeader>

            <div className="mx-auto mt-12 max-w-[660px] space-y-4">
              <div className="flex items-center justify-between text-sm font-medium text-[var(--app-text-soft)]">
                <span>{progressText}</span>
                <span>{progressPercentage}%</span>
              </div>
              <Progress
                value={progressPercentage}
                className="h-4 rounded-full bg-[var(--app-accent-soft)] [&_[data-slot=progress-indicator]]:bg-[linear-gradient(90deg,var(--app-accent),var(--app-accent-hover))]"
              />
              {checkError && <p className="text-center text-sm text-red-600">{checkError}</p>}
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden px-8 py-9 sm:px-12 sm:py-10">
            <div className="app-ambient-orb pointer-events-none absolute left-1/2 top-[-96px] h-64 w-64 -translate-x-1/2" />
            <DialogHeader className="items-center text-center">
              <div className="app-soft-panel flex h-[92px] w-[92px] items-center justify-center rounded-[28px] p-2.5">
                <img
                  src={appLogo}
                  alt="mpeditor"
                  className="h-[72px] w-[72px] rounded-[22px] object-cover"
                />
              </div>
              <DialogTitle className="mt-9 text-[28px] font-semibold tracking-[-0.04em] text-[var(--app-text)]">
                {t("updater.updateAvailable")}
              </DialogTitle>
            </DialogHeader>

            <div className="mx-auto mt-10 max-w-[500px] space-y-6">
              <div className="rounded-[24px] border border-[#eee9e3] bg-white px-6 py-5">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] pb-4">
                  <span className="text-[18px] font-medium text-[var(--app-text-faint)]">
                    {t("updater.currentVersion")}
                  </span>
                  <span className="text-[18px] font-semibold text-[var(--app-text)]">
                    {`v${update?.currentVersion ?? ""}`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 pt-4">
                  <span className="text-[18px] font-medium text-[var(--app-text-faint)]">
                    {t("updater.latestVersionLabel")}
                  </span>
                  <span className="text-[18px] font-semibold text-[var(--app-info)]">
                    {`v${update?.version ?? ""}`}
                  </span>
                </div>
              </div>

              {update?.body ? (
                <div className="rounded-[24px] border border-[#f0ece7] bg-[var(--app-panel-subtle)] px-6 py-5">
                  <p className="text-[18px] font-semibold text-[var(--app-text)]">
                    {t("updater.releaseNotes")}
                  </p>
                  <div className="mt-4 whitespace-pre-wrap text-[16px] leading-[1.8] text-[var(--app-text-soft)]">
                    {update.body}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
        {!downloading && !installed && (
          <DialogFooter className="justify-center gap-4 px-8 pb-9 sm:px-12 sm:pb-10">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="app-btn-secondary h-14 min-w-[180px] rounded-[var(--radius-button)] px-8 text-[18px] font-semibold shadow-none"
            >
              {t("updater.later")}
            </Button>
            <Button
              onClick={handleInstall}
              className="app-btn-primary h-14 min-w-[180px] rounded-[var(--radius-button)] px-8 text-[18px] font-semibold shadow-none"
            >
              {t("updater.installNow")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function useManualUpdateCheck(options?: UpdaterNetworkOptions) {
  const { checkUpdate, checking, update, checkError } = useUpdater(options);
  const [showNoUpdate, setShowNoUpdate] = useState(false);
  const [checkErrorType, setCheckErrorType] = useState<"plugin-not-found" | "unknown" | null>(null);

  const handleCheckUpdate = async () => {
    setShowNoUpdate(false);
    const result = await checkUpdate();
    setCheckErrorType(result.errorType);
    if (!result.update && !result.error) {
      setShowNoUpdate(true);
    }
  };

  return {
    checkUpdate: handleCheckUpdate,
    checking,
    hasUpdate: !!update,
    showNoUpdate,
    checkError,
    checkErrorType,
    dismissNoUpdate: () => setShowNoUpdate(false),
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}
