import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { THEMES, THEME_GROUPS, type Theme } from "../lib/themes";

interface ThemeSelectorProps {
  activeTheme: string;
  onThemeChange: (themeId: string) => void;
}

/** Extract a css property value from an inline style string */
function extractStyle(styleStr: string, prop: string): string | null {
  const regex = new RegExp(`${prop}\\s*:\\s*([^;!]+)`, "i");
  const match = styleStr.match(regex);
  return match ? match[1].trim() : null;
}

/** Build a mini color swatch from theme styles */
function ThemeSwatch({ styles }: { styles: Record<string, string> }) {
  const bg = extractStyle(styles.container || "", "background-color") || "var(--app-panel-solid)";
  const textColor = extractStyle(styles.p || "", "color") || "var(--app-text)";
  const h1Color = extractStyle(styles.h1 || "", "color") || textColor;
  const accentColor = extractStyle(styles.a || styles.blockquote || "", "color") || h1Color;

  return (
    <div
      className="flex h-5 gap-0.5 overflow-hidden rounded-md border border-[var(--app-border)]"
      style={{ width: "48px" }}
    >
      <div className="flex-1" style={{ backgroundColor: bg }} />
      <div className="flex-1" style={{ backgroundColor: h1Color }} />
      <div className="flex-1" style={{ backgroundColor: accentColor }} />
      <div className="flex-1" style={{ backgroundColor: textColor }} />
    </div>
  );
}

export default function ThemeSelector({ activeTheme, onThemeChange }: ThemeSelectorProps) {
  const { t } = useTranslation();
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedThemeName = THEMES.find((t) => t.id === activeTheme)?.name;

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowBottomFade(scrollHeight - scrollTop - clientHeight > 20);
  };

  useEffect(() => {
    if (isThemeOpen && scrollRef.current) {
      handleScroll();
    }
  }, [isThemeOpen]);

  // Keep top quick-switch pills fixed for best discoverability.
  const pillThemeIds = ["apple", "claude", "wechat", "sspai"];
  const pillThemes: Theme[] = pillThemeIds
    .map((id) => THEMES.find((theme) => theme.id === id))
    .filter((theme): theme is Theme => Boolean(theme));
  const isInDropdown = !pillThemes.some((theme) => theme.id === activeTheme);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-r border-transparent px-4 py-3 md:border-[var(--app-border)] lg:gap-4 lg:px-6">
      <span className="hidden shrink-0 text-sm font-semibold uppercase tracking-widest text-[var(--app-text-faint)] xl:block">
        {t("workspace.settings.theme.selectorLabel")}
      </span>

      <div className="app-segmented shrink-0">
        {pillThemes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            className={`app-segmented-item ${activeTheme === theme.id ? "app-segmented-item-active" : ""}`}
          >
            {theme.name.split(" ")[0]}
          </button>
        ))}
      </div>

      <div className="relative shrink-0">
        <button
          onClick={() => setIsThemeOpen(!isThemeOpen)}
          className={`app-btn-secondary text-compact inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-button)] px-4 font-medium transition-all ${isInDropdown ? "" : "app-btn-ghost border-transparent bg-transparent shadow-none"}`}
          aria-expanded={isThemeOpen}
          aria-haspopup="dialog"
        >
          {isInDropdown
            ? selectedThemeName
            : t("workspace.settings.theme.selectorAll", { count: THEMES.length })}
          <ChevronDown
            size={14}
            className={`transition-transform duration-300 ${isThemeOpen ? "rotate-180" : ""}`}
          />
        </button>

        <AnimatePresence>
          {isThemeOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="app-dialog-scrim fixed inset-0 z-40"
                onClick={() => setIsThemeOpen(false)}
              />
              {/* Grid panel */}
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                className="app-popover-surface fixed left-4 right-4 top-auto z-50 w-auto overflow-hidden rounded-[var(--radius-xl)] sm:absolute sm:left-0 sm:right-auto sm:top-12 sm:w-[580px] md:w-[680px]"
                style={{ maxHeight: "min(70vh, 600px)" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pb-2 pt-4">
                  <span className="text-md font-semibold text-[var(--app-text)]">
                    {t("workspace.settings.theme.selectorChoose", { count: THEMES.length })}
                  </span>
                  <button
                    onClick={() => setIsThemeOpen(false)}
                    className="app-icon-button h-11 w-11 rounded-[var(--radius-sm)]"
                    aria-label={t("workspace.common.close")}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Scrollable grid */}
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="overflow-y-auto px-5 pb-5"
                  style={{ maxHeight: "min(calc(70vh - 56px), 544px)" }}
                >
                  {THEME_GROUPS.map((group, groupIdx) => (
                    <div key={group.label}>
                      <div
                        className={`flex items-center gap-2 ${groupIdx > 0 ? "mt-4 border-t border-[var(--app-border)] pt-4" : "mt-1"}`}
                      >
                        <span className="text-sm font-semibold uppercase tracking-widest text-[var(--app-text-faint)]">
                          {group.label}
                        </span>
                        <span className="text-xs text-[var(--app-text-faint)]">
                          {t("workspace.settings.theme.selectorCount", {
                            count: group.themes.length,
                          })}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {group.themes.map((theme) => (
                          <button
                            key={theme.id}
                            onClick={() => {
                              onThemeChange(theme.id);
                              setIsThemeOpen(false);
                            }}
                            className={`app-card-interactive relative flex flex-col items-start gap-1.5 rounded-[var(--radius-lg)] p-3 text-left ${
                              activeTheme === theme.id
                                ? "app-card-selected ring-2 ring-[var(--app-accent-soft)]"
                                : ""
                            }`}
                          >
                            <div className="flex w-full items-center justify-between">
                              <ThemeSwatch styles={theme.styles} />
                              {activeTheme === theme.id && (
                                <Check size={14} className="text-[var(--app-accent)]" />
                              )}
                            </div>
                            <span className="text-compact font-semibold leading-tight text-[var(--app-text)]">
                              {theme.name}
                            </span>
                            <span className="line-clamp-2 text-sm leading-snug text-[var(--app-text-soft)]">
                              {theme.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom fade scroll hint */}
                <div
                  className={`pointer-events-none absolute bottom-0 left-0 right-0 h-12 rounded-b-[18px] bg-gradient-to-t from-[var(--app-panel-solid)] to-transparent transition-opacity duration-200 ${showBottomFade ? "opacity-100" : "opacity-0"}`}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Theme description next to selectors */}
      <div className="ml-4 hidden items-center border-l border-[var(--app-border)] pl-4 lg:flex">
        <p className="text-compact max-w-[300px] truncate font-medium tracking-wide text-[var(--app-text-soft)] xl:max-w-[450px]">
          <span className="mr-1 font-semibold text-[var(--app-text)]">
            {THEMES.find((t) => t.id === activeTheme)?.name}：
          </span>
          {THEMES.find((t) => t.id === activeTheme)?.description}
        </p>
      </div>
    </div>
  );
}
