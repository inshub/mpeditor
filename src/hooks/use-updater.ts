import { useState, useCallback, useRef } from "react";
import {
  checkForUpdates,
  downloadAndInstall,
  UpdateProgress,
  UpdaterNetworkOptions,
} from "@/lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";

interface CheckUpdateResult {
  update: Update | null;
  error: string | null;
  errorType: "plugin-not-found" | "unknown" | null;
}

export function useUpdater(options?: UpdaterNetworkOptions) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Use ref to always get the latest options
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const checkUpdate = useCallback(async (): Promise<CheckUpdateResult> => {
    setChecking(true);
    setCheckError(null);
    try {
      // Always use the latest options from ref
      const availableUpdate = await checkForUpdates(optionsRef.current);
      setUpdate(availableUpdate);
      return { update: availableUpdate, error: null, errorType: null };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const isPluginMissing = /plugin\s+updater\s+not\s+found/i.test(rawMessage);
      const message = isPluginMissing
        ? "Updater plugin is unavailable in current runtime. Please use a packaged release build."
        : rawMessage;
      setUpdate(null);
      setCheckError(message);
      console.error("Failed to check for updates:", error);
      return {
        update: null,
        error: message,
        errorType: isPluginMissing ? "plugin-not-found" : "unknown",
      };
    } finally {
      setChecking(false);
    }
  }, []); // Empty deps since we use ref

  const installUpdate = useCallback(async () => {
    setDownloading(true);
    setProgress(null);
    setCheckError(null);
    try {
      // Always use the latest options from ref
      await downloadAndInstall((progressEvent) => {
        setProgress(progressEvent);
      }, optionsRef.current);
      // Download completed successfully, but we don't auto-relaunch anymore
      // The user will manually restart when ready
      setDownloading(false);
    } catch (error) {
      console.error("Failed to install update:", error);
      const rawMessage = error instanceof Error ? error.message : String(error);
      setCheckError(rawMessage);
      setDownloading(false);
    }
  }, []); // Empty deps since we use ref

  return {
    update,
    checking,
    downloading,
    progress,
    checkError,
    checkUpdate,
    installUpdate,
  };
}
