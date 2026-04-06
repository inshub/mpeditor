export const SETTINGS_INPUT_CLASS =
  "app-input btn-input text-sm disabled:opacity-50";
export const SETTINGS_FIELD_LABEL_CLASS =
  "mb-2 text-sm font-medium text-[var(--app-text-soft)]";
export const SETTINGS_TOGGLE_BASE = "relative h-7 w-12 rounded-full transition-colors";
export const SETTINGS_CARD_CLASS = "app-settings-card";
export const LANGUAGE_OPTIONS = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
] as const;
export const AI_LAB_PROVIDERS = [{ value: "modelscope", label: "ModelScope Async API" }] as const;
export const AI_LAB_IMAGE_SIZES = [
  { value: "1888x800", label: "1888 x 800（推荐，2.35:1）" },
  { value: "1024x1024", label: "1024 x 1024（正方形）" },
  { value: "768x1024", label: "768 x 1024（竖版）" },
  { value: "1024x768", label: "1024 x 768（横版）" },
] as const;
export const DEFAULT_AI_LAB_PROVIDER = "modelscope";
export const DEFAULT_AI_LAB_ENDPOINT = "https://api-inference.modelscope.cn/v1";
export const DEFAULT_AI_LAB_MODEL = "Tongyi-MAI/Z-Image-Turbo";
export const DEFAULT_AI_LAB_API_KEY = "";
export const AI_LAB_API_KEY_PLACEHOLDER = "请输入 API Key / Enter API Key";
export const DEFAULT_AI_LAB_IMAGE_SIZE = "1888x800";
export const SETTINGS_DIALOG_TOASTER_ID = "settings-dialog-center";
export const GIT_CONTENT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "mdx",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
]);
export const changelogUrl = "https://github.com/inshub/mpeditor/releases";
export const officialSiteUrl = "https://github.com/inshub/mpeditor";
export const termsUrl = "https://github.com/inshub/mpeditor/blob/main/Terms.md";
export const privacyUrl = "https://github.com/inshub/mpeditor/blob/main/Privacy.md";
