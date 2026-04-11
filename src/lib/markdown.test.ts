import { describe, expect, it } from "vitest";
import { applyTheme, md, preprocessMarkdown } from "./markdown";

function renderMarkdown(markdown: string) {
  return md.render(preprocessMarkdown(markdown));
}

describe("preprocessMarkdown", () => {
  it("keeps bold rendering intact next to trailing punctuation", () => {
    const html = renderMarkdown("2025年初，伦敦黄金市场的一个月拆借利率一度升至**5%**。");

    expect(html).toContain("<strong>5%</strong>。");
    expect(html).not.toContain("**5%**");
  });

  it("repairs bold segments that start with a symbol and attach to previous text", () => {
    const html = renderMarkdown("利率变化至**-5%**。");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const strong = doc.querySelector("strong");

    expect(strong?.textContent?.replace(/\u200B/g, "")).toBe("-5%");
  });

  it("does not merge separate bold blocks across blank lines", () => {
    const html = renderMarkdown("**5 %**\n\n**5%**");
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(doc.querySelectorAll("strong")).toHaveLength(2);
  });
});

describe("applyTheme", () => {
  it("groups consecutive standalone images into an image grid", () => {
    const html = '<p><img src="a.png" /></p><p><img src="b.png" /></p>';
    const themed = applyTheme(html, "apple");
    const doc = new DOMParser().parseFromString(themed, "text/html");
    const grid = doc.querySelector(".image-grid");

    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll("img")).toHaveLength(2);
  });

  it("keeps highlighted comments non-italic for apple", () => {
    const rawHtml = renderMarkdown("```javascript\n// 中文注释\nconst mpeditor = 1;\n```");
    const themed = applyTheme(rawHtml, "apple");
    const doc = new DOMParser().parseFromString(themed, "text/html");
    const code = doc.querySelector("pre code");
    const comment = doc.querySelector(".hljs-comment");

    expect(code?.getAttribute("style")).toContain("font-style: normal !important;");
    expect(code?.getAttribute("style")).toContain("white-space: pre;");
    expect(comment?.getAttribute("style")).toContain("font-style: normal;");
  });

  it("does not override bloomberg block-code font inheritance", () => {
    const rawHtml = renderMarkdown("```javascript\n// terminal theme\nconst mpeditor = 1;\n```");
    const themed = applyTheme(rawHtml, "bloomberg");
    const doc = new DOMParser().parseFromString(themed, "text/html");
    const container = doc.querySelector("body > div");
    const pre = doc.querySelector("pre");
    const code = doc.querySelector("pre code");

    expect(container?.getAttribute("style")).toContain('"Courier New"');
    expect(pre?.getAttribute("style")).not.toContain("font-family:");
    expect(code?.getAttribute("style")).not.toContain("font-family:");
    expect(themed).not.toContain(
      '"SF Mono", "Cascadia Code", "Fira Code", Consolas, Menlo, Monaco, monospace'
    );
  });

  it("preserves traffic light dots with circular appearance in preview", () => {
    const rawHtml = renderMarkdown("```javascript\nconst hello = 'world';\n```");
    const themed = applyTheme(rawHtml, "apple");
    const doc = new DOMParser().parseFromString(themed, "text/html");

    // In preview mode (not WeChat compatible), traffic lights should be inside <pre>
    const trafficLightDiv = doc.querySelector("pre > div:first-child");
    expect(trafficLightDiv).not.toBeNull();

    // Check that individual dots exist
    const dots = Array.from(trafficLightDiv?.querySelectorAll("span") || []);
    expect(dots.length).toBe(3);

    // Check that dots have circular appearance (border-radius: 50%)
    dots.forEach((dot) => {
      const dotStyle = dot.getAttribute("style") || "";
      expect(dotStyle).toContain("border-radius: 50%");
    });
  });
});
