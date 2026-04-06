import { check } from "@tauri-apps/plugin-updater";

export interface UpdateProgress {
  event: "Started" | "Progress" | "Finished";
  data?: {
    contentLength?: number;
    chunkLength?: number;
    downloadedBytes?: number;
  };
}

export interface UpdaterNetworkOptions {
  proxy?: string;
}

export interface AppNetworkProxy {
  enabled: boolean;
  socksProxy: string;
  httpProxy: string;
  httpsProxy: string;
}

export function resolveUpdaterProxyUrl(proxy?: AppNetworkProxy): string | undefined {
  if (!proxy?.enabled) return undefined;
  return proxy.socksProxy.trim() || proxy.httpsProxy.trim() || proxy.httpProxy.trim() || undefined;
}

export async function checkForUpdates(options?: UpdaterNetworkOptions) {
  const proxy = options?.proxy?.trim();
  try {
    return await check({
      proxy: proxy || undefined,
    });
  } catch (error) {
    // Fallback: if proxy-based check fails, retry once without proxy.
    if (proxy) {
      console.warn("Updater check via proxy failed, retrying direct request...", error);
      return check();
    }
    throw error;
  }
}

export async function downloadAndInstall(
  onProgress?: (progress: UpdateProgress) => void,
  options?: UpdaterNetworkOptions
) {
  const update = await checkForUpdates(options);

  if (!update) {
    return false;
  }

  console.log(`Found update ${update.version} from ${update.date} with notes: ${update.body}`);

  let downloaded = 0;
  let contentLength = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength!;
        console.log(`Started downloading ${event.data.contentLength} bytes`);
        onProgress?.({
          event: "Started",
          data: { ...event.data, downloadedBytes: 0 },
        });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        console.log(`Downloaded ${downloaded} from ${contentLength}`);
        onProgress?.({
          event: "Progress",
          data: { ...event.data, contentLength, downloadedBytes: downloaded },
        });
        break;
      case "Finished":
        console.log("Download finished");
        onProgress?.({
          event: "Finished",
          data: { contentLength, downloadedBytes: contentLength },
        });
        break;
    }
  });

  console.log("Update installed");
  // Don't auto-relaunch, let user decide when to restart
  // await relaunch();
  return true;
}
