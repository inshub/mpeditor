import React from "react";
import DeviceFrame from "./DeviceFrame";

interface PreviewPanelProps {
  renderedHtml: string;
  deviceWidthClass: string;
  previewDevice: "mobile" | "tablet" | "pc";
  previewRef: React.RefObject<HTMLDivElement>;
  previewOuterScrollRef: React.RefObject<HTMLDivElement>;
  previewInnerScrollRef: React.RefObject<HTMLDivElement>;
  onPreviewOuterScroll: () => void;
  onPreviewInnerScroll: () => void;
  scrollSyncEnabled: boolean;
}

export default function PreviewPanel({
  renderedHtml,
  deviceWidthClass,
  previewDevice,
  previewRef,
  previewOuterScrollRef,
  previewInnerScrollRef,
  onPreviewOuterScroll,
  onPreviewInnerScroll,
  scrollSyncEnabled,
}: PreviewPanelProps) {
  const isFramedDevice = previewDevice !== "pc";

  return (
    <div className="relative z-20 flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-transparent">
      {isFramedDevice ? (
        <div
          className={`${deviceWidthClass} relative flex min-h-0 flex-1 items-start justify-center self-center px-5 py-4 transition-all duration-500`}
        >
          <DeviceFrame
            device={previewDevice as "mobile" | "tablet"}
            scrollRef={previewInnerScrollRef}
            onScroll={scrollSyncEnabled ? onPreviewInnerScroll : undefined}
          >
            <div
              ref={previewRef}
              data-testid="preview-content"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
              className={`preview-content min-w-full ${previewDevice === "mobile" ? "px-1 pb-8 pt-1" : "px-2 pb-10 pt-2"}`}
            />
          </DeviceFrame>
        </div>
      ) : (
        <div className="relative flex min-h-0 w-full flex-1 items-stretch justify-center px-5 py-4 transition-all duration-500">
          <div className="app-panel-solid h-full w-full overflow-hidden rounded-[var(--radius-lg)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,252,249,0.86))] dark:bg-[linear-gradient(180deg,rgba(30,32,38,0.95),rgba(24,26,32,0.92))]">
            <div
              ref={previewOuterScrollRef}
              data-testid="preview-outer-scroll"
              onScroll={scrollSyncEnabled ? onPreviewOuterScroll : undefined}
              className="no-scrollbar h-full overflow-y-auto overflow-x-hidden"
            >
              <div
                ref={previewRef}
                data-testid="preview-content"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
                className="preview-content min-w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
