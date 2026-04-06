import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

interface NetworkProxyPayload {
  enabled: boolean;
  socksProxy: string;
  httpProxy: string;
  httpsProxy: string;
}

interface ModelScopeGenerateCoverResponse {
  taskId: string;
  imageUrl: string;
  taskStatus: string;
}

interface CoverGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiEndpoint: string;
  apiKey: string;
  model: string;
  imageSize: string;
  networkProxy: NetworkProxyPayload;
  onInsertImage: (imageUrl: string) => void;
  defaultTitle?: string;
  documentContent?: string;
}

const FALLBACK_TITLE = "公众号封面";

const STOPWORDS = new Set([
  "我们",
  "你们",
  "他们",
  "这个",
  "那个",
  "这些",
  "那些",
  "如何",
  "为什么",
  "什么",
  "以及",
  "关于",
  "一个",
  "一种",
  "可以",
  "需要",
  "进行",
  "通过",
  "问题",
  "方法",
  "经验",
  "总结",
  "教程",
  "指南",
  "实践",
  "分享",
  "article",
  "title",
  "with",
  "from",
  "that",
  "this",
  "have",
  "will",
  "your",
  "about",
  "guide",
  "tips",
  "how",
  "what",
  "when",
  "where",
  "why",
]);

type CoverCategory =
  | "ai"
  | "reading"
  | "coffee"
  | "health"
  | "travel"
  | "food"
  | "music"
  | "finance"
  | "general";

const CATEGORY_PRESETS: Record<
  CoverCategory,
  { theme: string; features: string; gradient: string; triggers: string[] }
> = {
  ai: {
    theme: "AI/technology",
    features:
      "glowing AI brain icon, floating skill badges, lightbulbs, stacked books, interlocking gears and neural network nodes",
    gradient: "cyan-blue",
    triggers: [
      "ai",
      "人工智能",
      "模型",
      "机器学习",
      "技术",
      "科技",
      "算法",
      "编程",
      "开发",
      "自动化",
    ],
  },
  reading: {
    theme: "reading/books",
    features: "colorful books, soft reading lamp, bookmark, gentle page layers",
    gradient: "warm beige",
    triggers: ["读书", "阅读", "书", "写作", "学习", "知识", "教育", "笔记"],
  },
  coffee: {
    theme: "coffee/beverage",
    features: "coffee cup, steam swirls, coffee beans, small cookie plate",
    gradient: "brown-cream",
    triggers: ["咖啡", "茶", "饮品", "奶茶", "下午茶"],
  },
  health: {
    theme: "health/fitness",
    features: "cute dumbbells, yoga mat, water bottle, heart icon",
    gradient: "fresh green-white",
    triggers: ["健康", "运动", "健身", "减脂", "睡眠", "营养", "冥想"],
  },
  travel: {
    theme: "travel/adventure",
    features: "suitcase, camera, globe, paper airplane, route pins",
    gradient: "sky blue-white",
    triggers: ["旅行", "旅游", "出行", "城市", "探险", "航班", "酒店"],
  },
  food: {
    theme: "food/cooking",
    features: "chef hat, cooking pot, vegetables, simple utensils, warm steam",
    gradient: "orange-cream",
    triggers: ["美食", "烹饪", "做饭", "食谱", "餐饮", "厨房"],
  },
  music: {
    theme: "music/art",
    features: "musical notes, headphones, stylized keyboard, soft rhythm waves",
    gradient: "purple-white",
    triggers: ["音乐", "艺术", "设计", "创意", "绘画", "摄影", "品牌"],
  },
  finance: {
    theme: "finance/business",
    features: "coins, piggy bank, bar chart blocks, growth arrow",
    gradient: "gold-cream",
    triggers: ["金融", "商业", "投资", "理财", "增长", "市场", "创业", "运营"],
  },
  general: {
    theme: "modern productivity",
    features: "abstract productivity icons, cards, check marks, gentle floating objects",
    gradient: "blue-cyan",
    triggers: [],
  },
};

const stripMarkdown = (input: string) =>
  input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/^#{1,6}\s+/gm, " ")
    .replace(/[>*_~\-|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const pickKeywords = (title: string, content: string) => {
  const base = `${title} ${stripMarkdown(content)}`.trim();
  if (!base) return [];
  const tokens =
    base.match(/[\u4e00-\u9fa5]{2,8}|[A-Za-z][A-Za-z0-9#+.-]{2,}/g)?.map((v) => v.trim()) ?? [];
  const freq = new Map<string, number>();
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (STOPWORDS.has(key) || STOPWORDS.has(token)) continue;
    if (token.length < 2) continue;
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .slice(0, 3);
};

const resolveCategory = (title: string, keywords: string[]): CoverCategory => {
  const merged = `${title} ${keywords.join(" ")}`.toLowerCase();
  const ordered: CoverCategory[] = [
    "ai",
    "reading",
    "coffee",
    "health",
    "travel",
    "food",
    "music",
    "finance",
  ];
  for (const category of ordered) {
    if (
      CATEGORY_PRESETS[category].triggers.some((trigger) => merged.includes(trigger.toLowerCase()))
    ) {
      return category;
    }
  }
  return "general";
};

const buildPromptFromTemplate = (title: string, content: string) => {
  const safeTitle = title.trim() || FALLBACK_TITLE;
  const keywords = pickKeywords(safeTitle, content);
  const category = resolveCategory(safeTitle, keywords);
  const preset = CATEGORY_PRESETS[category];
  const keywordHint = keywords.length ? keywords.map((k) => `"${k}"`).join(", ") : safeTitle;

  return `Create a cute,cartoon 3D illustration with a ${preset.theme} theme.
Style: Pixar-like animation, toy-like texture, soft edges, matte/clay-like materials, bright and soft lighting, vibrant colors.
Main elements: ${preset.features}.
Topic hint: ${keywordHint}.
Composition: Main 3D elements MUST be positioned in the RIGHT 30-40% of the image.
The LEFT 60-70% MUST be clean empty space with a subtle ${preset.gradient} gradient background.
Aspect ratio: 2.35:1 (ultra-wide).
IMPORTANT: NO text, NO letters, NO numbers, NO borders, NO people, NO characters, NO neon/cyberpunk, NO dark themes, NO abstract tech lines, NO glassmorphism, NO photorealism.`;
};

export default function CoverGeneratorDialog({
  open,
  onOpenChange,
  apiEndpoint,
  apiKey,
  model,
  imageSize,
  networkProxy,
  onInsertImage,
  defaultTitle,
  documentContent = "",
}: CoverGeneratorDialogProps) {
  const { t } = useTranslation();
  const [titleInput, setTitleInput] = useState("");
  const [showPromptPreview, setShowPromptPreview] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState("");
  const [editablePrompt, setEditablePrompt] = useState("");
  const [promptManuallyEdited, setPromptManuallyEdited] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowPromptPreview(true);
    setStatusText(null);
    setTaskId(null);
    setImageUrl(null);
    setLastPrompt("");
    setPromptManuallyEdited(false);
    setTitleInput(defaultTitle?.trim() || "");
  }, [open, defaultTitle]);

  const safeImageSize = useMemo(() => imageSize.trim() || "1888x800", [imageSize]);
  const keywordList = useMemo(
    () => pickKeywords(titleInput || defaultTitle || "", documentContent),
    [titleInput, defaultTitle, documentContent]
  );
  const promptPreview = useMemo(
    () => buildPromptFromTemplate(titleInput || defaultTitle || FALLBACK_TITLE, documentContent),
    [titleInput, defaultTitle, documentContent]
  );

  // Auto-update editable prompt when title/content changes, but only if not manually edited
  useEffect(() => {
    if (!promptManuallyEdited) {
      setEditablePrompt(promptPreview);
    }
  }, [promptPreview, promptManuallyEdited]);

  const handleGenerate = async () => {
    const finalTitle = titleInput.trim();
    if (!finalTitle) {
      toast.error(t("workspace.coverGenerator.titleRequired"));
      return;
    }

    const finalPrompt = editablePrompt.trim();
    if (!finalPrompt) {
      toast.error(t("workspace.coverGenerator.promptRequired"));
      return;
    }

    setGenerating(true);
    setStatusText(t("workspace.coverGenerator.generating"));
    setTaskId(null);
    setImageUrl(null);
    setLastPrompt(finalPrompt);

    try {
      const response = await invoke<ModelScopeGenerateCoverResponse>(
        "generate_cover_with_modelscope",
        {
          request: {
            apiEndpoint,
            apiKey,
            model,
            size: safeImageSize,
            prompt: finalPrompt,
            networkProxy,
          },
        }
      );
      setTaskId(response.taskId);
      setImageUrl(response.imageUrl);
      setStatusText(t("workspace.coverGenerator.generateSuccess"));
      toast.success(t("workspace.coverGenerator.generateSuccess"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusText(`${t("workspace.coverGenerator.generateFailed")}: ${message}`);
      toast.error(`${t("workspace.coverGenerator.generateFailed")}: ${message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleResetPrompt = () => {
    setEditablePrompt(promptPreview);
    setPromptManuallyEdited(false);
  };

  const handlePromptChange = (value: string) => {
    setEditablePrompt(value);
    setPromptManuallyEdited(true);
  };

  const handleCopyImageUrl = async () => {
    if (!imageUrl) return;
    try {
      await navigator.clipboard.writeText(imageUrl);
      toast.success(t("workspace.coverGenerator.copyUrlSuccess"));
    } catch {
      toast.error(t("workspace.coverGenerator.copyUrlFailed"));
    }
  };

  const handleInsertToDocument = () => {
    if (!imageUrl) return;
    onInsertImage(imageUrl);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-modal-shell !h-[min(760px,calc(100vh-3rem))] !w-[min(1024px,calc(100vw-2rem))] !max-w-[1024px] overflow-hidden rounded-[var(--radius-xl)] p-0">
        <DialogTitle className="sr-only">{t("workspace.coverGenerator.title")}</DialogTitle>
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div className="app-topbar border-b border-[var(--app-border)] px-8 py-6">
            <div className="flex items-center gap-2 text-4xl font-semibold tracking-[-0.03em] text-[var(--app-text)]">
              <Sparkles size={22} />
              <span>{t("workspace.coverGenerator.title")}</span>
            </div>
          </div>

          <div className="thin-scrollbar min-h-0 space-y-4 overflow-y-auto p-8 pr-5">
            <div className="app-soft-panel rounded-[var(--radius-lg)] p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="app-status-badge app-status-badge-info px-2.5 py-1">
                  {t("workspace.coverGenerator.recommended")} {safeImageSize}
                </span>
              </div>
            </div>

            <div className="app-soft-panel rounded-[var(--radius-lg)] p-5">
              <div className="text-base font-semibold text-[var(--app-text)]">
                {t("workspace.coverGenerator.titleInputLabel")}
              </div>
              <input
                value={titleInput}
                onChange={(event) => setTitleInput(event.target.value)}
                placeholder={t("workspace.coverGenerator.titlePlaceholder")}
                className="app-input btn-input mt-4 text-sm"
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-[var(--app-text-soft)]">
                  {t("workspace.coverGenerator.contentRefTip")}
                </div>
                <button
                  onClick={() => setShowPromptPreview((prev) => !prev)}
                  className="app-btn-secondary btn-touchy inline-flex shrink-0 items-center rounded-[var(--radius-button)] px-3 text-xs"
                >
                  {showPromptPreview
                    ? t("workspace.coverGenerator.hidePromptPreview")
                    : t("workspace.coverGenerator.showPromptPreview")}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {keywordList.length > 0 ? (
                  keywordList.map((keyword) => (
                    <span key={keyword} className="app-chip rounded-full px-2 py-0.5 text-xs">
                      {keyword}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[var(--app-text-soft)]">
                    {t("workspace.coverGenerator.noKeywords")}
                  </span>
                )}
              </div>

              {showPromptPreview && (
                <>
                  <textarea
                    value={editablePrompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    rows={8}
                    className="app-input mt-3 px-4 py-3 text-xs"
                  />
                </>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="app-btn-primary btn-touchy inline-flex items-center gap-2 rounded-[var(--radius-button)] px-4 text-sm font-semibold disabled:opacity-70"
                >
                  {generating && <Loader2 size={15} className="animate-spin" />}
                  {generating
                    ? t("workspace.coverGenerator.generating")
                    : t("workspace.coverGenerator.generateButton")}
                </button>
                <button
                  onClick={() => setTitleInput(defaultTitle?.trim() || "")}
                  className="app-btn-secondary btn-touchy inline-flex items-center rounded-[var(--radius-button)] px-4 text-sm"
                >
                  {t("workspace.coverGenerator.resetTitle")}
                </button>
                {showPromptPreview && promptManuallyEdited && (
                  <button
                    onClick={handleResetPrompt}
                    className="app-btn-secondary btn-touchy inline-flex items-center rounded-[var(--radius-button)] px-4 text-sm"
                  >
                    {t("workspace.coverGenerator.resetPrompt")}
                  </button>
                )}
              </div>

              {lastPrompt && (
                <div className="mt-2 text-xs text-[var(--app-text-soft)]">
                  {t("workspace.coverGenerator.promptBuilt")}
                </div>
              )}

              {statusText && (
                <div className="app-subtle mt-4 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--app-text-soft)]">
                  {statusText}
                </div>
              )}
              {taskId && (
                <div className="mt-2 text-xs text-[var(--app-text-soft)]">Task ID: {taskId}</div>
              )}
            </div>

            {imageUrl && (
              <div className="app-soft-panel overflow-hidden rounded-[var(--radius-lg)] p-4">
                <img
                  src={imageUrl}
                  alt="AI cover"
                  className="w-full rounded-[var(--radius-sm)] object-cover"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={handleInsertToDocument}
                    className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-[var(--app-accent)] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {t("workspace.coverGenerator.insertToDocument")}
                  </button>
                  <button
                    onClick={handleCopyImageUrl}
                    className="app-btn-secondary inline-flex min-h-11 items-center rounded-[var(--radius-button)] px-3 py-1.5 text-xs"
                  >
                    {t("workspace.coverGenerator.copyUrl")}
                  </button>
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="app-btn-secondary inline-flex min-h-11 items-center rounded-[var(--radius-button)] px-3 py-1.5 text-xs"
                  >
                    {t("workspace.coverGenerator.openImage")}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
