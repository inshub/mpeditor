import type { Dispatch, SetStateAction } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  AI_LAB_API_KEY_PLACEHOLDER,
  AI_LAB_IMAGE_SIZES,
  AI_LAB_PROVIDERS,
  DEFAULT_AI_LAB_ENDPOINT,
  DEFAULT_AI_LAB_MODEL,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_INPUT_CLASS,
} from "./constants";

interface LabDraft {
  aiLabProvider: string;
  aiLabApiEndpoint: string;
  aiLabApiKey: string;
  aiLabModel: string;
  aiLabImageSize: string;
}

interface LabSectionProps<T extends LabDraft> {
  settingsDraft: T;
  setSettingsDraft: Dispatch<SetStateAction<T>>;
  labTestingConnection: boolean;
  labStatusText: string | null;
  applyRecommendedLabPreset: () => void;
  saveAiLabConfig: () => void;
  resetAiLabConfig: () => void;
  testAiLabConnection: () => void;
  t: (key: string) => string;
}

export function LabSection<T extends LabDraft>({
  settingsDraft,
  setSettingsDraft,
  labTestingConnection,
  labStatusText,
  applyRecommendedLabPreset,
  saveAiLabConfig,
  resetAiLabConfig,
  testAiLabConnection,
  t,
}: LabSectionProps<T>) {
  return (
    <div className="app-settings-card">
      <div className="text-base font-semibold text-[var(--app-text)]">
        {t("workspace.settings.lab.configTitle")}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className={SETTINGS_FIELD_LABEL_CLASS}>
            {t("workspace.settings.lab.provider")}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="app-input btn-input flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-4 text-left text-sm font-medium"
              >
                <span>
                  {AI_LAB_PROVIDERS.find((option) => option.value === settingsDraft.aiLabProvider)
                    ?.label ?? "ModelScope Async API"}
                </span>
                <ChevronDown size={16} className="text-[var(--app-text-soft)]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={8}
              className="app-popover-surface w-[260px] rounded-[var(--radius-sm)] p-2 backdrop-blur"
            >
              {AI_LAB_PROVIDERS.map((option) => {
                const selected = settingsDraft.aiLabProvider === option.value;
                return (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        aiLabProvider: option.value,
                      }))
                    }
                    className={`rounded-[var(--radius-sm)] px-3 py-3 text-sm ${selected ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "text-[var(--app-text)]"}`}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span>{option.label}</span>
                      {selected && <Check size={16} />}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div>
          <div className={SETTINGS_FIELD_LABEL_CLASS}>
            {t("workspace.settings.lab.apiEndpoint")}
          </div>
          <input
            value={settingsDraft.aiLabApiEndpoint}
            onChange={(event) =>
              setSettingsDraft((prev) => ({
                ...prev,
                aiLabApiEndpoint: event.target.value,
              }))
            }
            placeholder={DEFAULT_AI_LAB_ENDPOINT}
            className={`${SETTINGS_INPUT_CLASS} btn-input`}
          />
        </div>

        <div>
          <div className={SETTINGS_FIELD_LABEL_CLASS}>
            API Key
          </div>
          <input
            value={settingsDraft.aiLabApiKey}
            onChange={(event) =>
              setSettingsDraft((prev) => ({
                ...prev,
                aiLabApiKey: event.target.value,
              }))
            }
            placeholder={AI_LAB_API_KEY_PLACEHOLDER}
            className={`${SETTINGS_INPUT_CLASS} btn-input`}
          />
          <div className="mt-1.5 text-xs text-[var(--app-text-soft)]">
            <span>{t("workspace.settings.lab.getApiKeyPrefix")}</span>
            <a
              href="https://modelscope.cn/my/access/token"
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-[var(--app-accent)] hover:underline"
            >
              {t("workspace.settings.lab.getApiKeyLink")}
            </a>
          </div>
        </div>

        <div>
          <div className={SETTINGS_FIELD_LABEL_CLASS}>
            {t("workspace.settings.lab.model")}
          </div>
          <input
            value={settingsDraft.aiLabModel}
            onChange={(event) =>
              setSettingsDraft((prev) => ({
                ...prev,
                aiLabModel: event.target.value,
              }))
            }
            placeholder={DEFAULT_AI_LAB_MODEL}
            className={`${SETTINGS_INPUT_CLASS} btn-input`}
          />
        </div>
      </div>

      <div className="mt-3">
        <div className={SETTINGS_FIELD_LABEL_CLASS}>
          {t("workspace.settings.lab.imageSize")}
        </div>
        <div className="flex flex-wrap gap-2">
          {AI_LAB_IMAGE_SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              onClick={() =>
                setSettingsDraft((prev) => ({
                  ...prev,
                  aiLabImageSize: size.value,
                }))
              }
              className={`app-segmented-option min-h-11 px-4 text-sm ${
                settingsDraft.aiLabImageSize === size.value
                  ? "app-segmented-option-active"
                  : ""
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      <div className="app-subtle mt-4 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-[var(--app-text-soft)]">
        {t("workspace.settings.lab.autoTip")}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={applyRecommendedLabPreset}
          className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm"
        >
          {t("workspace.settings.lab.applyRecommended")}
        </button>
        <button
          onClick={saveAiLabConfig}
          className="app-btn-primary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm font-medium"
        >
          {t("workspace.settings.lab.saveConfig")}
        </button>
        <button
          onClick={resetAiLabConfig}
          className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm"
        >
          {t("workspace.settings.lab.clearConfig")}
        </button>
        <button
          onClick={testAiLabConnection}
          disabled={labTestingConnection}
          className="app-btn-secondary btn-touchy inline-flex items-center justify-center rounded-[var(--radius-button)] px-4 text-sm disabled:opacity-70"
        >
          {labTestingConnection
            ? t("workspace.settings.lab.testingConnection")
            : t("workspace.settings.lab.testConnection")}
        </button>
      </div>
      {labStatusText && (
        <div className="app-subtle mt-4 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--app-text-soft)]">
          {labStatusText}
        </div>
      )}
    </div>
  );
}
