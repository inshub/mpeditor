export const normalizeRelativePath = (value: string, trimTrailingSlash = true) => {
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^[/]+/, "")
    .replace(/\/{2,}/g, "/");
  if (!trimTrailingSlash) return normalized;
  return normalized.replace(/\/+$/, "");
};
