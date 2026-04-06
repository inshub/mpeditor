import { describe, expect, it } from "vitest";
import { applyTheme, md, preprocessMarkdown } from "./markdown";
import { makeWeChatCompatibleSync } from "./wechatCompat";

function renderMarkdown(markdown: string) {
  return md.render(preprocessMarkdown(markdown));
}

describe.skip("makeWeChatCompatibleSync", () => {
  it("converts code blocks to wrapped layout for WeChat drafts", () => {
    const rawHtml = renderMarkdown(
      "```bash\ngor --input-raw :80 --output-http http://example.com/really/long/path\n```"
    );
    const themed = applyTheme(rawHtml, "apple");
    const compatible = makeWeChatCompatibleSync(themed, "apple");
    const doc = new DOMParser().parseFromString(compatible, "text/html");
    const pre = doc.querySelector("pre");
    const code = doc.querySelector("pre code");

    expect(pre?.getAttribute("style")).toContain("white-space: pre-wrap !important;");
    expect(pre?.getAttribute("style")).toContain("overflow-x: visible !important;");
    expect(code?.getAttribute("style")).toContain("white-space: pre-wrap !important;");
    expect(code?.getAttribute("style")).toContain("word-break: break-word !important;");
  });

  it("converts markdown lists into bullet paragraphs for stable WeChat pasting", () => {
    const rawHtml = renderMarkdown(
      [
        "- **跨平台粘贴**：直接从飞书、**Notion**、**Word**甚至任意网页复制富文本",
        "",
        "- **智能清洗**：自动剥离冗余样式和乱码",
        "",
        "- **零学习成本**：不需要会写 Markdown",
      ].join("\n")
    );
    const themed = applyTheme(rawHtml, "apple");
    const compatible = makeWeChatCompatibleSync(themed, "apple");
    const doc = new DOMParser().parseFromString(compatible, "text/html");
    const listParagraphs = Array.from(doc.querySelectorAll("p")).filter((p) =>
      p.textContent?.includes("•")
    );

    expect(doc.querySelector("ul")).toBeNull();
    expect(doc.querySelector("li")).toBeNull();
    expect(listParagraphs).toHaveLength(3);
    listParagraphs.forEach((paragraph) => {
      expect(paragraph.textContent?.trim().startsWith("•")).toBe(true);
    });
  });
});
