import { ChevronRight, Loader2 } from "lucide-react";

interface AboutSectionProps {
  aboutVersion: string;
  checking: boolean;
  downloading: boolean;
  appLogoSrc: string;
  onCheckUpdate: () => void;
  onOpenChangelog: () => void;
  onOpenOfficialSite: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  t: (key: string) => string;
}

export function AboutSection({
  aboutVersion,
  checking,
  downloading,
  appLogoSrc,
  onCheckUpdate,
  onOpenChangelog,
  onOpenOfficialSite,
  onOpenTerms,
  onOpenPrivacy,
  t,
}: AboutSectionProps) {
  return (
    <div className="mx-auto w-full max-w-[760px] pt-2">
      <div className="flex flex-col items-center">
        <div className="app-soft-panel rounded-[var(--radius-4xl)] p-3">
          <img
            src={appLogoSrc}
            alt="mpeditor"
            className="h-[80px] w-[80px] rounded-[var(--radius-xl)] object-cover"
          />
        </div>
        <div className="mt-5 text-[56px] font-semibold tracking-[-0.04em] text-[var(--app-text)]">
          mpeditor
        </div>
      </div>

      <div className="mt-10 space-y-5">
        <div className="app-soft-panel rounded-[24px] px-7 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--app-text)]">
              {t("workspace.settings.about.currentVersion")}
              <span className="ml-3 text-[16px] font-medium text-[var(--app-text-faint)]">
                {aboutVersion}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onCheckUpdate}
                disabled={checking || downloading}
                className="app-btn-primary btn-touchy inline-flex min-w-[132px] items-center justify-center gap-2 rounded-[var(--radius-button)] px-7 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-70"
              >
                {(checking || downloading) && <Loader2 size={16} className="animate-spin" />}
                {checking
                  ? t("updater.checking")
                  : downloading
                    ? t("updater.downloading")
                    : t("updater.checkForUpdates")}
              </button>
              <button
                onClick={onOpenChangelog}
                className="app-btn-secondary btn-touchy inline-flex min-w-[132px] items-center justify-center rounded-[var(--radius-button)] px-7 text-[15px] font-semibold"
              >
                {t("workspace.settings.about.changelog")}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={onOpenOfficialSite}
          className="app-card-interactive flex min-h-[72px] w-full items-center justify-between rounded-[24px] px-7 text-left text-[18px] font-semibold tracking-[-0.01em] text-[var(--app-text)]"
        >
          <span>{t("workspace.settings.about.officialSite")}</span>
          <ChevronRight size={20} className="text-[var(--app-text-faint)]" />
        </button>
      </div>

      <div className="mt-14 flex items-center justify-center gap-4 text-[16px] text-[var(--app-text-faint)]">
        <button onClick={onOpenTerms} className="transition hover:text-[var(--app-text)]">
          {t("workspace.settings.about.terms")}
        </button>
        <span>|</span>
        <button onClick={onOpenPrivacy} className="transition hover:text-[var(--app-text)]">
          {t("workspace.settings.about.privacy")}
        </button>
      </div>
    </div>
  );
}
