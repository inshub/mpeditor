import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , artifactsDirArg, outputFileArg] = process.argv;

if (!artifactsDirArg) {
  throw new Error("Usage: node scripts/generate-latest-json.mjs <artifacts-dir> [output-file]");
}

const artifactsDir = path.resolve(process.cwd(), artifactsDirArg);
const outputFile = path.resolve(process.cwd(), outputFileArg ?? "latest.json");
const repo = process.env.GITHUB_REPOSITORY;
const tag = process.env.GITHUB_REF_NAME;
const version = process.env.APP_VERSION ?? tag?.replace(/^v/, "") ?? "";
const notes = process.env.RELEASE_NOTES ?? "See the GitHub release for details.";

if (!repo || !tag) {
  throw new Error("GITHUB_REPOSITORY and GITHUB_REF_NAME are required.");
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      if (entry.isFile()) {
        return [fullPath];
      }
      return [];
    }),
  );
  return files.flat();
}

function normalizeArch(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes("aarch64") || lower.includes("arm64")) return "aarch64";
  if (lower.includes("x86_64") || lower.includes("amd64") || lower.includes("x64")) return "x86_64";
  if (lower.includes("i686") || lower.includes("x86")) return "i686";
  if (lower.includes("armv7") || lower.includes("armhf")) return "armv7";
  if (lower.includes("universal")) return "universal";
  return null;
}

function inferArchFromPath(filePath) {
  const segments = filePath.split(path.sep);
  for (const segment of segments) {
    const arch = normalizeArch(segment);
    if (arch) return arch;
  }
  return null;
}

function bundleInfo(filename) {
  if (filename.endsWith(".app.tar.gz")) return { os: "darwin", bundle: "app" };
  if (filename.endsWith("-setup.exe")) return { os: "windows", bundle: "nsis" };
  if (filename.endsWith(".msi")) return { os: "windows", bundle: "msi" };
  if (filename.endsWith(".AppImage")) return { os: "linux", bundle: "appimage" };
  return null;
}

function addPlatformEntry(platforms, key, signature, url) {
  platforms[key] = { signature, url };
}

const files = await walk(artifactsDir);
const fileSet = new Set(files);
const filesByBaseName = new Map(files.map((file) => [path.basename(file), file]));
const platforms = {};

for (const file of files) {
  if (!file.endsWith(".sig")) continue;

  const signatureBaseName = path.basename(file, ".sig");
  const companionInSameDir = path.join(path.dirname(file), signatureBaseName);
  const companionPath = fileSet.has(companionInSameDir)
    ? companionInSameDir
    : filesByBaseName.get(signatureBaseName);
  if (!companionPath) continue;

  const info = bundleInfo(signatureBaseName);
  const arch = normalizeArch(signatureBaseName) ?? inferArchFromPath(file);
  if (!info || !arch) continue;

  const signature = (await readFile(file, "utf8")).trim();
  const assetName = path.basename(companionPath);
  const url = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
  const primaryKey = `${info.os}-${arch}`;
  const installerKey = `${info.os}-${arch}-${info.bundle}`;

  addPlatformEntry(platforms, primaryKey, signature, url);
  addPlatformEntry(platforms, installerKey, signature, url);

  if (info.os === "darwin" && arch === "universal") {
    addPlatformEntry(platforms, "darwin-aarch64", signature, url);
    addPlatformEntry(platforms, "darwin-x86_64", signature, url);
    addPlatformEntry(platforms, "darwin-aarch64-app", signature, url);
    addPlatformEntry(platforms, "darwin-x86_64-app", signature, url);
  }
}

if (Object.keys(platforms).length === 0) {
  throw new Error(`No updater artifacts with signatures found under ${artifactsDir}`);
}

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(
  outputFile,
  `${JSON.stringify(
    {
      version,
      notes,
      pub_date: new Date().toISOString(),
      platforms,
    },
    null,
    2,
  )}\n`,
);

const outputStats = await stat(outputFile);
console.log(`Generated ${outputFile} (${outputStats.size} bytes)`);
