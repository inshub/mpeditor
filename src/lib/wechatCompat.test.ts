import { describe, expect, it } from "vitest";
import { applyTheme, md, preprocessMarkdown } from "./markdown";
import { makeWeChatCompatibleSync } from "./wechatCompat";

function renderMarkdown(markdown: string) {
  return md.render(preprocessMarkdown(markdown));
}

describe("makeWeChatCompatibleSync", () => {
  it("replaces \\n with <br> inside code blocks for WeChat line break preservation", () => {
    const rawHtml = renderMarkdown("```javascript\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```");
    const themed = applyTheme(rawHtml, "apple");
    const compatible = makeWeChatCompatibleSync(themed, "apple");
    const doc = new DOMParser().parseFromString(compatible, "text/html");

    const code = doc.querySelector("pre code");
    expect(code).not.toBeNull();
    // Should contain <br> tags to preserve line breaks in WeChat
    expect(code?.innerHTML).toContain("<br>");
    // Original line content should still be present
    expect(code?.textContent).toContain("const a = 1;");
    expect(code?.textContent).toContain("const b = 2;");
  });

  it("does not override pre/code styles for WeChat drafts", () => {
    const rawHtml = renderMarkdown(
      "```bash\ngor --input-raw :80 --output-http http://example.com/really/long/path\n```"
    );
    const themed = applyTheme(rawHtml, "apple");
    const compatible = makeWeChatCompatibleSync(themed, "apple");
    const doc = new DOMParser().parseFromString(compatible, "text/html");
    const pre = doc.querySelector("pre");
    const code = doc.querySelector("pre code");

    // WeChat handles code wrapping natively — do NOT add pre-wrap or word-break overrides
    expect(pre?.getAttribute("style")).not.toContain("white-space: pre-wrap");
    expect(code?.getAttribute("style")).not.toContain("word-break: break-word");
  });

  it("preserves traffic light dots in code blocks for WeChat drafts", () => {
    const rawHtml = renderMarkdown("```javascript\nconst hello = 'world';\n```");
    const themed = applyTheme(rawHtml, "apple");
    const compatible = makeWeChatCompatibleSync(themed, "apple");

    const doc = new DOMParser().parseFromString(compatible, "text/html");

    // After WeChat compatibility, traffic lights should be OUTSIDE <pre>,
    // using <section> tags instead of <div>/<span> for better WeChat support.
    const pre = doc.querySelector("pre");
    expect(pre).not.toBeNull();

    // Traffic light wrapper should be a <section> before <pre>
    const trafficLightWrapper = pre?.previousElementSibling;
    expect(trafficLightWrapper).not.toBeNull();
    expect(trafficLightWrapper?.tagName).toBe("SECTION");

    // Check that individual dots exist as <section> elements
    const dots = Array.from(trafficLightWrapper?.querySelectorAll(":scope > section") || []);
    expect(dots.length).toBe(3);

    // Check that dots have circular appearance with WeChat-whitelisted styles
    dots.forEach((dot) => {
      const dotStyle = dot.getAttribute("style") || "";
      expect(dotStyle).toContain("display:inline-block");
      expect(dotStyle).toContain("width:12px");
      expect(dotStyle).toContain("height:12px");
      expect(dotStyle).toContain("border-radius:50%");
      expect(dotStyle).toContain("background:");
    });
  });
});
