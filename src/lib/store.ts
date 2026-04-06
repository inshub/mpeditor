import { useState } from "react";

/**
 * Unified localStorage management for mpeditor
 *
 * Usage:
 * ```ts
 * // Direct read/write
 * import { readStore, writeStore } from '@/lib/store';
 * const theme = readStore('theme', 'system');
 * writeStore('theme', 'dark');
 *
 * // React hook with auto-sync
 * import { useLocalStorage } from '@/lib/store';
 * const [value, setValue] = useLocalStorage('theme', 'system');
 * ```
 */

const STORAGE_PREFIX = "mpeditor.";

/**
 * Storage keys used throughout the app
 * Centralized to avoid typos and enable autocomplete
 */
export const STORAGE_KEYS = {
  workspace: "workspace.v1",
  themeMode: "themeMode.v1",
  activeTheme: "activeTheme.v1",
  previewDevice: "previewDevice.v1",
  scrollSync: "scrollSync.v1",
  defaultTheme: "defaultTheme.v1",
  defaultDevice: "defaultDevice.v1",
  autoLaunch: "autoLaunch.v1",
  startupRestore: "startupRestore.v1",
  language: "language.v1",
  proxyEnabled: "proxyEnabled.v1",
  socksProxy: "socksProxy.v1",
  httpProxy: "httpProxy.v1",
  httpsProxy: "httpsProxy.v1",
  imageHostProvider: "imageHostProvider.v1",
  imageHostWechatAccountId: "imageHostWechatAccountId.v1",
  wechatProxyUrl: "wechatProxyUrl.v1",
  wechatAccounts: "wechatAccounts.v1",
  defaultWechatAccountId: "defaultWechatAccountId.v1",
  gitBrowsePrefs: "gitBrowsePrefs.v1",
  gitAuthPrefs: "gitAuthPrefs.v1",
  wechatImageProxyDomain: "wechatImageProxyDomain.v1",
  wechatAppId: "wechatAppId.v1",
  wechatAppSecret: "wechatAppSecret.v1",
  aliyunAccessKeyId: "aliyunAccessKeyId.v1",
  aliyunAccessKeySecret: "aliyunAccessKeySecret.v1",
  aliyunBucket: "aliyunBucket.v1",
  aliyunRegion: "aliyunRegion.v1",
  aliyunUseSSL: "aliyunUseSSL.v1",
  aliyunCdnDomain: "aliyunCdnDomain.v1",
  aliyunPathPrefix: "aliyunPathPrefix.v1",
  aiLabProvider: "aiLabProvider.v1",
  aiLabApiEndpoint: "aiLabApiEndpoint.v1",
  aiLabApiKey: "aiLabApiKey.v1",
  aiLabModel: "aiLabModel.v1",
  aiLabImageSize: "aiLabImageSize.v1",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Get the full storage key with prefix
 */
function getFullKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

/**
 * Read a value from localStorage
 * @param key - Storage key (with or without prefix)
 * @param fallback - Default value if key doesn't exist
 * @returns The stored value or fallback
 */
export function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const fullKey = getFullKey(key);
    const raw = localStorage.getItem(fullKey);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * Write a value to localStorage
 * @param key - Storage key (with or without prefix)
 * @param value - Value to store
 */
export function writeStore<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const fullKey = getFullKey(key);
    localStorage.setItem(fullKey, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to write to localStorage for key "${key}":`, error);
  }
}

/**
 * Remove a value from localStorage
 * @param key - Storage key to remove
 */
export function removeStore(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const fullKey = getFullKey(key);
    localStorage.removeItem(fullKey);
  } catch (error) {
    console.error(`Failed to remove from localStorage for key "${key}":`, error);
  }
}

/**
 * Clear all mpeditor values from localStorage
 */
export function clearStore(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error("Failed to clear localStorage:", error);
  }
}

/**
 * React hook for localStorage state management
 * Automatically syncs state with localStorage
 *
 * @param key - Storage key from STORAGE_KEYS
 * @param initialValue - Default value if not stored
 * @returns [storedValue, setValue] tuple like useState
 *
 * @example
 * const [theme, setTheme] = useLocalStorage(STORAGE_KEYS.themeMode, 'system');
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Read from localStorage on mount
  const readValue = (): T => {
    try {
      const fullKey = getFullKey(key);
      const raw = localStorage.getItem(fullKey);
      return raw === null ? initialValue : (JSON.parse(raw) as T);
    } catch {
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(readValue);

  // Return a wrapped version of useState's setter function that...
  // ... persists the new value to localStorage.
  const setValue = (value: T | ((prev: T) => T)) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;

      setStoredValue(valueToStore);
      writeStore(key, valueToStore);
    } catch (error) {
      console.error(`Failed to set localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}

/**
 * Batch read multiple values from localStorage
 * Useful for initial state hydration
 */
export function readBatch<T extends Record<string, any>>(keysAndDefaults: T): T {
  const result = {} as T;
  for (const [key, defaultValue] of Object.entries(keysAndDefaults)) {
    (result as any)[key] = readStore(key as string, defaultValue);
  }
  return result;
}

/**
 * Migration helper to move old keys to new keys
 */
export function migrateStore(oldKey: string, newKey: string): void {
  if (typeof window === "undefined") return;
  try {
    const oldValue = localStorage.getItem(getFullKey(oldKey));
    if (oldValue !== null) {
      writeStore(newKey, JSON.parse(oldValue));
      removeStore(oldKey);
    }
  } catch (error) {
    console.error(`Failed to migrate from "${oldKey}" to "${newKey}":`, error);
  }
}
