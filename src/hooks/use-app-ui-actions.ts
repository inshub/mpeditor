import { toast } from "sonner";
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";

type SettingsSection =
  | "general"
  | "theme"
  | "publishing"
  | "network"
  | "editor"
  | "about"
  | "imageHost"
  | "wechatConfig"
  | "lab"
  | "git";

interface UseAppUiActionsOptions<
  TSettingsDraft extends { socksProxy: string; httpProxy: string; httpsProxy: string },
> {
  t: TFunction;
  markdownInput: string;
  setSettingsDraft: Dispatch<SetStateAction<TSettingsDraft>>;
  setSettingsSection: Dispatch<SetStateAction<SettingsSection>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  updateActiveDocument: (value: string) => void;
  setCoverGeneratorOpen: Dispatch<SetStateAction<boolean>>;
}

export function useAppUiActions<
  TSettingsDraft extends { socksProxy: string; httpProxy: string; httpsProxy: string },
>({
  t,
  markdownInput,
  setSettingsDraft,
  setSettingsSection,
  setSettingsOpen,
  updateActiveDocument,
  setCoverGeneratorOpen,
}: UseAppUiActionsOptions<TSettingsDraft>) {
  const applyProxyPreset = (preset: "socks5" | "http" | "https" | "clear") => {
    setSettingsDraft((prev) => {
      if (preset === "clear") {
        return { ...prev, socksProxy: "", httpProxy: "", httpsProxy: "" };
      }
      if (preset === "socks5") {
        return {
          ...prev,
          socksProxy: prev.socksProxy || "socks5://127.0.0.1:7890",
          httpProxy: "",
          httpsProxy: "",
        };
      }
      if (preset === "http") {
        return {
          ...prev,
          socksProxy: "",
          httpProxy: prev.httpProxy || "http://127.0.0.1:7890",
          httpsProxy: "",
        };
      }
      return {
        ...prev,
        socksProxy: "",
        httpProxy: "",
        httpsProxy: prev.httpsProxy || "https://127.0.0.1:7890",
      };
    });
  };

  const openSettings = (section: SettingsSection = "general") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  const insertCoverIntoCurrentDocument = (imageUrl: string) => {
    const url = imageUrl.trim();
    if (!url) {
      toast.error(t("workspace.coverGenerator.insertFailed"));
      return;
    }

    const imageLine = `![${t("workspace.coverGenerator.coverAlt")}](${url})`;
    const current = markdownInput || "";
    const lines = current.split("\n");
    const firstLine = lines[0] ?? "";

    let nextContent = "";
    if (/^#{1,6}\s+/.test(firstLine)) {
      const rest = lines.slice(1).join("\n").replace(/^\n+/, "");
      nextContent = `${firstLine}\n\n${imageLine}${rest ? `\n\n${rest}` : ""}`;
    } else {
      nextContent = `${imageLine}${current ? `\n\n${current}` : ""}`;
    }

    updateActiveDocument(nextContent);
    setCoverGeneratorOpen(false);
    toast.success(t("workspace.coverGenerator.insertSuccess"));
  };

  return {
    applyProxyPreset,
    openSettings,
    insertCoverIntoCurrentDocument,
  };
}
