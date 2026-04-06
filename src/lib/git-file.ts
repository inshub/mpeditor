import { convertFileSrc } from "@tauri-apps/api/core";

const GIT_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

const getFileExtension = (value?: string) => value?.split(".").pop()?.toLowerCase() ?? "";

export const isGitImagePath = (value?: string) => GIT_IMAGE_EXTENSIONS.has(getFileExtension(value));

export const buildGitImageMarkdown = async (fileName: string, localFilePath: string) => {
  const assetUrl = await convertFileSrc(localFilePath);
  return `![${fileName}](${assetUrl})`;
};
