export interface GitBrowsePreference {
  contentRoot: string;
  includeMarkdown: boolean;
  includeImages: boolean;
  excludeHiddenFiles: boolean;
}

export const DEFAULT_GIT_BROWSE_PREFERENCE: GitBrowsePreference = {
  contentRoot: "",
  includeMarkdown: true,
  includeImages: true,
  excludeHiddenFiles: true,
};

export const inferRepoNameFromUrl = (value: string) =>
  value
    .trim()
    .replace(/\/+$/, "")
    .split("/")
    .pop()
    ?.replace(/\.git$/i, "") ?? "";

export const normalizeContentRoot = (value: string) => {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/` : "";
};

export const isHiddenGitName = (value: string) => value.trim().startsWith(".");

export const getAllowedContentExtensions = (preference: GitBrowsePreference) => {
  const allowed = new Set<string>(["txt"]);
  if (preference.includeMarkdown) {
    allowed.add("md");
    allowed.add("markdown");
    allowed.add("mdx");
  }
  if (preference.includeImages) {
    allowed.add("png");
    allowed.add("jpg");
    allowed.add("jpeg");
    allowed.add("webp");
    allowed.add("gif");
    allowed.add("svg");
  }
  return allowed;
};
