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
    try {
      const plainText = previewRef.current.innerText;
      let copiedOk = false;

      if (isTauriRuntime()) {
        const finalHtmlForCopy = makeWeChatCompatibleSync(renderedHtml, previewThemeId);
        copiedOk = copyViaExecCommand(finalHtmlForCopy, plainText);
        if (!copiedOk && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(plainText);
          copiedOk = true;
        }
      } else {
        const finalHtmlForCopy = await makeWeChatCompatible(renderedHtml, previewThemeId);
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          try {
            const blob = new Blob([finalHtmlForCopy], { type: "text/html" });
            const textBlob = new Blob([plainText], { type: "text/plain" });
            const clipboardItem = new ClipboardItem({
              "text/html": blob,
              "text/plain": textBlob,
            });
            await navigator.clipboard.write([clipboardItem]);
            copiedOk = true;
          } catch {
            copiedOk = false;
          }
        }

        if (!copiedOk) {
          copiedOk = copyViaExecCommand(finalHtmlForCopy, plainText);
        }

        if (!copiedOk && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(plainText);
          copiedOk = true;
        }
      }

      if (!copiedOk) {
        try {
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
    } catch (copyErr) {
      console.error("Copy failed", copyErr);
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
