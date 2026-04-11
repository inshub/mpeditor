import { useState } from "react";
import { toast } from "sonner";
import type { RefObject } from "react";
import type { TFunction } from "i18next";
import { makeWeChatCompatible, makeWeChatCompatibleSync } from "../lib/wechatCompat";

interface UseCopyActionsOptions {
  t: TFunction;
  isTauriRuntime: () => boolean;
  previewRef: RefObject<HTMLDivElement | null>;
  renderedHtml: string;
  previewThemeId: string;
}

const copyViaExecCommand = (html: string, plainText: string): boolean => {
  const container = document.createElement("div");
  container.contentEditable = "true";
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.whiteSpace = "pre-wrap";
  container.innerHTML = html || plainText;
  document.body.appendChild(container);

  const selection = window.getSelection();
  if (!selection) {
    document.body.removeChild(container);
    return false;
  }

  const range = document.createRange();
  range.selectNodeContents(container);
  selection.removeAllRanges();
  selection.addRange(range);
  const ok = document.execCommand("copy");
  selection.removeAllRanges();
  document.body.removeChild(container);
  return ok;
};

export function useCopyActions({
  t,
  isTauriRuntime,
  previewRef,
  renderedHtml,
  previewThemeId,
}: UseCopyActionsOptions) {
  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const handleCopy = async () => {
    if (!previewRef.current) return;
    setIsCopying(true);
    const startedAt = Date.now();
    const traceId = `copy-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const plainText = previewRef.current.innerText;
      let copiedOk = false;
      const tauriRuntime = isTauriRuntime();
      console.info(
        `[copy] start trace=${traceId} tauri=${tauriRuntime} html_len=${renderedHtml.length} plain_text_len=${plainText.length} theme=${previewThemeId}`
      );

      if (tauriRuntime) {
        console.info(`[copy] stage=wechat_compat_sync trace=${traceId}`);
        const finalHtmlForCopy = makeWeChatCompatibleSync(renderedHtml, previewThemeId, {
          normalizeListsToParagraphs: false,
        });
        console.info(
          `[copy] stage=wechat_compat_sync_done trace=${traceId} output_len=${finalHtmlForCopy.length}`
        );

        // Prefer ClipboardItem (same as raphael-publish) — preserves inline styles exactly.
        // execCommand("copy") re-serializes HTML through the browser and can lose/modify styles.
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          try {
            console.info(`[copy] stage=clipboard_write_rich trace=${traceId}`);
            const blob = new Blob([finalHtmlForCopy], { type: "text/html" });
            const textBlob = new Blob([plainText], { type: "text/plain" });
            const clipboardItem = new ClipboardItem({
              "text/html": blob,
              "text/plain": textBlob,
            });
            await navigator.clipboard.write([clipboardItem]);
            copiedOk = true;
            console.info(`[copy] stage=clipboard_write_rich_done trace=${traceId}`);
          } catch {
            copiedOk = false;
            console.warn(`[copy] stage=clipboard_write_rich_failed trace=${traceId}`);
          }
        }

        if (!copiedOk) {
          console.info(`[copy] stage=exec_command_copy trace=${traceId}`);
          copiedOk = copyViaExecCommand(finalHtmlForCopy, plainText);
          console.info(`[copy] stage=exec_command_copy_done trace=${traceId} ok=${copiedOk}`);
        }

        if (!copiedOk && navigator.clipboard?.writeText) {
          console.info(`[copy] stage=clipboard_write_text trace=${traceId}`);
          await navigator.clipboard.writeText(plainText);
          copiedOk = true;
          console.info(`[copy] stage=clipboard_write_text_done trace=${traceId}`);
        }
      } else {
        console.info(`[copy] stage=wechat_compat_async trace=${traceId}`);
        const finalHtmlForCopy = await makeWeChatCompatible(renderedHtml, previewThemeId);
        console.info(
          `[copy] stage=wechat_compat_async_done trace=${traceId} output_len=${finalHtmlForCopy.length}`
        );
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          try {
            console.info(`[copy] stage=clipboard_write_rich trace=${traceId}`);
            const blob = new Blob([finalHtmlForCopy], { type: "text/html" });
            const textBlob = new Blob([plainText], { type: "text/plain" });
            const clipboardItem = new ClipboardItem({
              "text/html": blob,
              "text/plain": textBlob,
            });
            await navigator.clipboard.write([clipboardItem]);
            copiedOk = true;
            console.info(`[copy] stage=clipboard_write_rich_done trace=${traceId}`);
          } catch {
            copiedOk = false;
            console.warn(`[copy] stage=clipboard_write_rich_failed trace=${traceId}`);
          }
        }

        if (!copiedOk) {
          console.info(`[copy] stage=exec_command_copy trace=${traceId}`);
          copiedOk = copyViaExecCommand(finalHtmlForCopy, plainText);
          console.info(`[copy] stage=exec_command_copy_done trace=${traceId} ok=${copiedOk}`);
        }

        if (!copiedOk && navigator.clipboard?.writeText) {
          console.info(`[copy] stage=clipboard_write_text trace=${traceId}`);
          await navigator.clipboard.writeText(plainText);
          copiedOk = true;
          console.info(`[copy] stage=clipboard_write_text_done trace=${traceId}`);
        }
      }

      if (!copiedOk) {
        try {
          console.info(`[copy] stage=exec_command_fallback trace=${traceId}`);
          document.execCommand("copy");
        } catch {
          // no-op, keep failure path below
        }
      }

      if (!copiedOk) {
        throw new Error("No clipboard strategy succeeded");
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      const elapsed = Date.now() - startedAt;
      console.info(`[copy] success trace=${traceId} duration_ms=${elapsed}`);
      if (elapsed > 400) {
        console.warn(`[copy] slow_copy duration_ms=${elapsed} plain_text_len=${plainText.length}`);
      }
    } catch (copyErr) {
      const elapsed = Date.now() - startedAt;
      console.error(`[copy] failed trace=${traceId} duration_ms=${elapsed}`, copyErr);
      toast.error(t("workspace.feedback.copyFailed"));
    } finally {
      setIsCopying(false);
    }
  };

  return {
    copied,
    isCopying,
    handleCopy,
  };
}
