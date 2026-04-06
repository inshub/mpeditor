import { useEffect, useState } from "react";
import { md, preprocessMarkdown, applyTheme } from "../lib/markdown";
import { useDebounce } from "./use-debounce";

export function usePreviewRender(markdownInput: string, previewThemeId: string) {
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const debouncedMarkdownInput = useDebounce(markdownInput, 180);

  useEffect(() => {
    const rawHtml = md.render(preprocessMarkdown(debouncedMarkdownInput));
    const styledHtml = applyTheme(rawHtml, previewThemeId);
    setRenderedHtml(styledHtml);
  }, [debouncedMarkdownInput, previewThemeId]);

  return renderedHtml;
}
