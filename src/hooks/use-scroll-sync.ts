import { useCallback, useEffect, useRef } from "react";

type ScrollSourcePanel = "editor" | "preview";
type PreviewDevice = "mobile" | "tablet" | "pc";

interface UseScrollSyncOptions {
  scrollSyncEnabled: boolean;
  previewDevice: PreviewDevice;
  renderedHtml: string;
}

export function useScrollSync({
  scrollSyncEnabled,
  previewDevice,
  renderedHtml,
}: UseScrollSyncOptions) {
  const editorScrollRef = useRef<HTMLTextAreaElement>(null);
  const previewOuterScrollRef = useRef<HTMLDivElement>(null);
  const previewInnerScrollRef = useRef<HTMLDivElement>(null);
  const scrollSyncLockRef = useRef<ScrollSourcePanel | null>(null);
  const scrollLockReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncScrollPosition = useCallback(
    (sourceElement: HTMLElement, targetElement: HTMLElement, sourcePanel: ScrollSourcePanel) => {
      if (!scrollSyncEnabled) return;
      if (scrollSyncLockRef.current && scrollSyncLockRef.current !== sourcePanel) return;

      const sourceMaxScroll = sourceElement.scrollHeight - sourceElement.clientHeight;
      const targetMaxScroll = targetElement.scrollHeight - targetElement.clientHeight;
      if (sourceMaxScroll <= 0) {
        targetElement.scrollTop = 0;
        return;
      }

      const scrollRatio = sourceElement.scrollTop / sourceMaxScroll;
      scrollSyncLockRef.current = sourcePanel;
      targetElement.scrollTop = scrollRatio * Math.max(targetMaxScroll, 0);

      if (scrollLockReleaseTimeoutRef.current) {
        clearTimeout(scrollLockReleaseTimeoutRef.current);
      }

      scrollLockReleaseTimeoutRef.current = setTimeout(() => {
        if (scrollSyncLockRef.current === sourcePanel) {
          scrollSyncLockRef.current = null;
        }
        scrollLockReleaseTimeoutRef.current = null;
      }, 50);
    },
    [scrollSyncEnabled]
  );

  const getActivePreviewScrollElement = useCallback(() => {
    if (previewDevice === "pc") return previewOuterScrollRef.current;
    return previewInnerScrollRef.current;
  }, [previewDevice]);

  const handleEditorScroll = useCallback(() => {
    const editorElement = editorScrollRef.current;
    const previewElement = getActivePreviewScrollElement();
    if (!editorElement || !previewElement) return;
    syncScrollPosition(editorElement, previewElement, "editor");
  }, [getActivePreviewScrollElement, syncScrollPosition]);

  const handlePreviewOuterScroll = useCallback(() => {
    if (previewDevice !== "pc") return;
    const previewElement = previewOuterScrollRef.current;
    const editorElement = editorScrollRef.current;
    if (!previewElement || !editorElement) return;
    syncScrollPosition(previewElement, editorElement, "preview");
  }, [previewDevice, syncScrollPosition]);

  const handlePreviewInnerScroll = useCallback(() => {
    if (previewDevice === "pc") return;
    const previewElement = previewInnerScrollRef.current;
    const editorElement = editorScrollRef.current;
    if (!previewElement || !editorElement) return;
    syncScrollPosition(previewElement, editorElement, "preview");
  }, [previewDevice, syncScrollPosition]);

  useEffect(() => {
    if (!scrollSyncEnabled) {
      scrollSyncLockRef.current = null;
      if (scrollLockReleaseTimeoutRef.current) {
        clearTimeout(scrollLockReleaseTimeoutRef.current);
        scrollLockReleaseTimeoutRef.current = null;
      }
    }
  }, [scrollSyncEnabled]);

  useEffect(() => {
    scrollSyncLockRef.current = null;
    if (scrollLockReleaseTimeoutRef.current) {
      clearTimeout(scrollLockReleaseTimeoutRef.current);
      scrollLockReleaseTimeoutRef.current = null;
    }
  }, [previewDevice]);

  useEffect(
    () => () => {
      if (scrollLockReleaseTimeoutRef.current) {
        clearTimeout(scrollLockReleaseTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!scrollSyncEnabled) return;
    let detachListeners: (() => void) | null = null;

    const frameId = requestAnimationFrame(() => {
      const editorElement = editorScrollRef.current;
      const previewOuterElement = previewOuterScrollRef.current;
      const previewInnerElement = previewInnerScrollRef.current;
      if (!editorElement) return;

      const handleEditorNativeScroll = () => {
        const activePreviewElement =
          previewDevice === "pc" ? previewOuterScrollRef.current : previewInnerScrollRef.current;
        if (!editorScrollRef.current || !activePreviewElement) return;
        syncScrollPosition(editorScrollRef.current, activePreviewElement, "editor");
      };

      const handlePreviewOuterNativeScroll = () => {
        if (previewDevice !== "pc" || !previewOuterScrollRef.current || !editorScrollRef.current)
          return;
        syncScrollPosition(previewOuterScrollRef.current, editorScrollRef.current, "preview");
      };

      const handlePreviewInnerNativeScroll = () => {
        if (previewDevice === "pc" || !previewInnerScrollRef.current || !editorScrollRef.current)
          return;
        syncScrollPosition(previewInnerScrollRef.current, editorScrollRef.current, "preview");
      };

      editorElement.addEventListener("scroll", handleEditorNativeScroll, { passive: true });
      previewOuterElement?.addEventListener("scroll", handlePreviewOuterNativeScroll, {
        passive: true,
      });
      previewInnerElement?.addEventListener("scroll", handlePreviewInnerNativeScroll, {
        passive: true,
      });

      detachListeners = () => {
        editorElement.removeEventListener("scroll", handleEditorNativeScroll);
        previewOuterElement?.removeEventListener("scroll", handlePreviewOuterNativeScroll);
        previewInnerElement?.removeEventListener("scroll", handlePreviewInnerNativeScroll);
      };
    });

    return () => {
      cancelAnimationFrame(frameId);
      detachListeners?.();
    };
  }, [scrollSyncEnabled, previewDevice, renderedHtml, syncScrollPosition]);

  return {
    editorScrollRef,
    previewOuterScrollRef,
    previewInnerScrollRef,
    handleEditorScroll,
    handlePreviewOuterScroll,
    handlePreviewInnerScroll,
  };
}
