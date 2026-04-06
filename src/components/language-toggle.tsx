import { Languages } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();

  useEffect(() => {
    const syncTrayMenu = async () => {
      try {
        await invoke("update_tray_menu", {
          showText: t("tray.show", { lng: i18n.language }),
          quitText: t("tray.quit", { lng: i18n.language }),
        });
      } catch (error) {
        console.error("Failed to sync tray menu:", error);
      }
    };

    void syncTrayMenu();
  }, [i18n.language, t]);

  const toggleLanguage = async () => {
    const newLang = i18n.language === "zh" ? "en" : "zh";
    await i18n.changeLanguage(newLang);

    // Update tray menu with new language
    try {
      await invoke("update_tray_menu", {
        showText: t("tray.show", { lng: newLang }),
        quitText: t("tray.quit", { lng: newLang }),
      });
    } catch (error) {
      console.error("Failed to update tray menu:", error);
    }

    // Emit event to sync language across windows
    await emit("language-changed", { language: newLang });
  };

  return (
    <button
      onClick={toggleLanguage}
      className="title-bar-btn mr-1"
      aria-label={t("language.toggle")}
      title={i18n.language === "zh" ? "Switch to English" : "Switch to 中文"}
    >
      <Languages className="h-4 w-4" />
    </button>
  );
}
