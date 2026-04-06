import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

export function useAboutVersion(open: boolean) {
  const [aboutVersion, setAboutVersion] = useState<string>("v1.0.0");

  useEffect(() => {
    if (!open) return;
    if (!(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window)) return;

    getVersion()
      .then((version) => setAboutVersion(`v${version}`))
      .catch((error) => {
        console.error("Failed to get app version", error);
      });
  }, [open]);

  return aboutVersion;
}
