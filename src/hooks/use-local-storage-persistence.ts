import { useEffect, useRef } from "react";
import { useDebounce } from "./use-debounce";

export interface PersistEntry {
  key: string;
  value: unknown;
}

export function useLocalStoragePersistence(entries: PersistEntry[], delay = 800) {
  const debouncedEntries = useDebounce(entries, delay);
  const latestEntriesRef = useRef(entries);

  const persistEntries = (targetEntries: PersistEntry[]) => {
    if (typeof window === "undefined") return;

    for (const entry of targetEntries) {
      const serialized = JSON.stringify(entry.value);
      if (localStorage.getItem(entry.key) !== serialized) {
        localStorage.setItem(entry.key, serialized);
      }
    }
  };

  useEffect(() => {
    latestEntriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    persistEntries(debouncedEntries);
  }, [debouncedEntries]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const flushLatestEntries = () => {
      persistEntries(latestEntriesRef.current);
    };

    window.addEventListener("pagehide", flushLatestEntries);
    window.addEventListener("beforeunload", flushLatestEntries);

    return () => {
      flushLatestEntries();
      window.removeEventListener("pagehide", flushLatestEntries);
      window.removeEventListener("beforeunload", flushLatestEntries);
    };
  }, []);
}
