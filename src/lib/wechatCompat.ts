import { THEMES } from "./themes";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Helper to convert images to Base64
async function getBase64Image(imgUrl: string): Promise<string> {
  try {
    if (imgUrl.startsWith("data:")) return imgUrl;

    const response = await fetch(imgUrl, { mode: "cors", cache: "default" });
    if (!response.ok) return imgUrl;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = async () => resolve(await fallbackToRust(imgUrl));
      reader.readAsDataURL(blob);
    });
  } catch {
    return fallbackToRust(imgUrl);
  }
}

async function fallbackToRust(imgUrl: string): Promise<string> {
  if (!isTauriRuntime()) return imgUrl;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("image_to_data_url_fallback", { src: imgUrl });
  } catch {
    return imgUrl;
  }
}

interface WechatCompatOptions {
  convertImagesToBase64?: boolean;
}

function extractCssValue(style: string, property: string) {
  const matched = style.match(new RegExp(`${property}\\s*:\\s*([^;]+);?`, "i"));
  return matched ? matched[1].trim() : "";
}

function convertListNodeToParagraphs(
  doc: Document,
  list: HTMLElement,
  themeStyles: Record<string, string>,
  depth = 0
): HTMLElement[] {
  const isOrdered = list.tagName === "OL";
  const start = Number(list.getAttribute("start") || "1");
  let index = start;
  const indentPx = 24 + depth * 20;
  const lineHeight = extractCssValue(themeStyles.li || themeStyles.p || "", "line-height") || "1.7";
  const fontSize =
    extractCssValue(themeStyles.p || themeStyles.container || "", "font-size") || "16px";
  const color =
    extractCssValue(themeStyles.li || themeStyles.p || themeStyles.container || "", "color") ||
    "#333333";
  const paragraphs: HTMLElement[] = [];

  Array.from(list.children).forEach((child) => {
    if (child.tagName !== "LI") return;
    const li = child as HTMLLIElement;
    const markerText = isOrdered ? `${index}.` : "•";
    index += 1;

    const paragraph = doc.createElement("p");
    paragraph.setAttribute(
      "style",
      [
        `margin: ${depth === 0 ? "10px 0" : "6px 0"} !important`,
        `padding-left: ${indentPx}px`,
        "text-indent: 0",
        `line-height: ${lineHeight} !important`,
        `font-size: ${fontSize}`,
        `color: ${color} !important`,
      ].join("; ") + ";"
    );

    const marker = doc.createElement("span");
    marker.setAttribute(
      "style",
      "display: inline-block; width: 1.25em; margin-left: -1.25em; font-weight: 700;"
    );
    marker.textContent = markerText;
    paragraph.appendChild(marker);

    const content = doc.createElement("span");
    Array.from(li.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (["UL", "OL"].includes(element.tagName)) return;
        if (["P", "DIV"].includes(element.tagName)) {
          while (element.firstChild) {
            content.appendChild(element.firstChild.cloneNode(true));
          }
          return;
        }
      }
      content.appendChild(node.cloneNode(true));
    });

    if (content.textContent?.trim() || content.querySelector("*")) {
      paragraph.appendChild(content);
      paragraphs.push(paragraph);
    }

    Array.from(li.children).forEach((nested) => {
      if (!["UL", "OL"].includes(nested.tagName)) return;
      paragraphs.push(
        ...convertListNodeToParagraphs(doc, nested as HTMLElement, themeStyles, depth + 1)
      );
    });
  });

  return paragraphs;
}

function buildWeChatCompatibleHtml(html: string, themeId: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const containerStyle = theme.styles.container || "";

  // 1. WeChat prefers <section> as the root wrapper for overall styling
  // If the root is a div, let's wrap or convert it to a section.
  const rootNodes = Array.from(doc.body.children);

  // Create new wrap section
  const section = doc.createElement("section");
  section.setAttribute("style", containerStyle);

  rootNodes.forEach((node) => {
    // If the original html came from applyTheme it already has a root div
    // We strip it regardless of exact style string match to avoid double layers
    if (node.tagName === "DIV" && rootNodes.length === 1) {
      Array.from(node.childNodes).forEach((child) => section.appendChild(child));
    } else {
      section.appendChild(node);
    }
  });

  // 2. WeChat ignores flex in many scenarios. Convert image flex wrappers to table layout.
  const flexLikeNodes = section.querySelectorAll("div, p.image-grid");
  flexLikeNodes.forEach((node) => {
    // Keep code block internals untouched.
    if (node.closest("pre, code")) return;

    const style = node.getAttribute("style") || "";
    const isFlexNode = style.includes("display: flex") || style.includes("display:flex");
    const isImageGrid = node.classList.contains("image-grid");
    if (!isFlexNode && !isImageGrid) return;

    const flexChildren = Array.from(node.children);
    if (flexChildren.every((child) => child.tagName === "IMG" || child.querySelector("img"))) {
      const table = doc.createElement("table");
      table.setAttribute(
        "style",
        "width: 100%; border-collapse: collapse; margin: 16px 0; border: none !important;"
      );
      const tbody = doc.createElement("tbody");
      const tr = doc.createElement("tr");
      tr.setAttribute("style", "border: none !important; background: transparent !important;");

      flexChildren.forEach((child) => {
        const td = doc.createElement("td");
        td.setAttribute(
          "style",
          "padding: 0 4px; vertical-align: top; border: none !important; background: transparent !important;"
        );
        td.appendChild(child);
        // Update child width to 100% since it's now bound by TD
        if (child.tagName === "IMG") {
          const currentStyle = child.getAttribute("style") || "";
          child.setAttribute(
            "style",
            currentStyle.replace(/width:\s*[^;]+;?/g, "") +
              " width: 100% !important; display: block; margin: 0 auto;"
          );
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
      table.appendChild(tbody);
      node.parentNode?.replaceChild(table, node);
    } else if (isFlexNode) {
      // Non-image flex items just get stripped of flex.
      node.setAttribute("style", style.replace(/display:\s*flex;?/g, "display: block;"));
    }
  });

  // 3. Convert lists into bullet/number paragraphs for deterministic WeChat paste behavior.
  const topLevelLists = Array.from(section.querySelectorAll("ul, ol")).filter(
    (list) => !list.parentElement?.closest("ul, ol")
  );
  topLevelLists.forEach((list) => {
    const paragraphs = convertListNodeToParagraphs(doc, list as HTMLElement, theme.styles);
    if (!paragraphs.length) return;
    const fragment = doc.createDocumentFragment();
    paragraphs.forEach((paragraph) => fragment.appendChild(paragraph));
    list.parentNode?.replaceChild(fragment, list);
  });

  // 4. Force Inheritance
  // WeChat's editor aggressively overrides inherited fonts on <p>, <li>, etc.
  // So we manually distribute the container's font properties to all individual blocks.
  const fontMatch = containerStyle.match(/font-family:\s*([^;]+);/);
  const sizeMatch = containerStyle.match(/font-size:\s*([^;]+);/);
  const colorMatch = containerStyle.match(/color:\s*([^;]+);/);
  const lineHeightMatch = containerStyle.match(/line-height:\s*([^;]+);/);

  // We only enforce on specific text tags that WeChat likes to hijack
  const textNodes = section.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, span");
  textNodes.forEach((node) => {
    // Preserve code highlighting tokens inside code blocks.
    if (node.tagName === "SPAN" && node.closest("pre, code")) return;

    let currentStyle = node.getAttribute("style") || "";

    if (fontMatch && !currentStyle.includes("font-family:")) {
      currentStyle += ` font-family: ${fontMatch[1]};`;
    }
    if (lineHeightMatch && !currentStyle.includes("line-height:")) {
      currentStyle += ` line-height: ${lineHeightMatch[1]};`;
    }
    // Add font-size if not present (only for standard text nodes so we don't shrink headings)
    if (
      sizeMatch &&
      !currentStyle.includes("font-size:") &&
      ["P", "LI", "BLOCKQUOTE", "SPAN"].includes(node.tagName)
    ) {
      currentStyle += ` font-size: ${sizeMatch[1]};`;
    }
    if (colorMatch && !currentStyle.includes("color:")) {
      currentStyle += ` color: ${colorMatch[1]};`;
    }

    node.setAttribute("style", currentStyle.trim());
  });

  // Keep CJK punctuation attached to preceding inline emphasis in WeChat.
  // Example: <strong>标题</strong>：说明 -> <strong>标题：</strong>说明
  const inlineNodes = section.querySelectorAll("strong, b, em, span, a, code");
  inlineNodes.forEach((node) => {
    const next = node.nextSibling;
    if (!next || next.nodeType !== Node.TEXT_NODE) return;
    const text = next.textContent || "";
    const match = text.match(/^\s*([：；，。！？、:])(.*)$/s);
    if (!match) return;

    const punct = match[1];
    const rest = match[2] || "";
    node.appendChild(doc.createTextNode(punct));
    if (rest) {
      next.textContent = rest;
    } else {
      next.parentNode?.removeChild(next);
    }
  });

  // 5. WeChat draft editor does not preserve horizontal scrolling in code blocks.
  // Convert them to wrapped blocks so long commands are not clipped after paste.
  section.querySelectorAll("pre").forEach((pre) => {
    const currentStyle = pre.getAttribute("style") || "";
    pre.setAttribute(
      "style",
      `${currentStyle}; white-space: pre-wrap !important; word-break: break-word !important; overflow-wrap: anywhere !important; overflow-x: visible !important; max-width: 100% !important;`
    );
  });

  section.querySelectorAll("pre code, pre .hljs").forEach((codeNode) => {
    const currentStyle = codeNode.getAttribute("style") || "";
    codeNode.setAttribute(
      "style",
      `${currentStyle}; white-space: pre-wrap !important; word-break: break-word !important; overflow-wrap: anywhere !important; overflow-x: visible !important; max-width: 100% !important;`
    );
  });

  doc.body.innerHTML = "";
  doc.body.appendChild(section);

  // Prevent WeChat from breaking lines between inline emphasis and leading CJK punctuation.
  // Example: </strong>： should stay on the same line.
  let outputHtml = doc.body.innerHTML;
  outputHtml = outputHtml.replace(
    /(<\/(?:strong|b|em|span|a|code)>)\s*([：；，。！？、])/g,
    "$1\u2060$2"
  );

  return outputHtml;
}

export function makeWeChatCompatibleSync(html: string, themeId: string) {
  return buildWeChatCompatibleHtml(html, themeId);
}

export async function makeWeChatCompatible(
  html: string,
  themeId: string,
  options: WechatCompatOptions = {}
): Promise<string> {
  const { convertImagesToBase64 = true } = options;
  const outputHtml = buildWeChatCompatibleHtml(html, themeId);

  if (!convertImagesToBase64) {
    return outputHtml;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(outputHtml, "text/html");
  const imgs = Array.from(doc.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (src && !src.startsWith("data:")) {
        const base64 = await getBase64Image(src);
        img.setAttribute("src", base64);
      }
    })
  );

  return doc.body.innerHTML;
}
