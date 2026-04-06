import { Ellipsis } from "lucide-react";
import type { TFunction } from "i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type WorkspaceEntryType = "file" | "folder";

interface WorkspaceTreeEntryMenuProps {
  sourcePath: string;
  entryType: WorkspaceEntryType;
  moveTargetDirectories: string[];
  actionsDisabled: boolean;
  t: TFunction;
  onCreateFile?: () => void;
  onCreateFolder?: () => void;
  onRename: () => void;
  onMove: (targetDirectory: string) => void;
  onDelete: () => void | Promise<void>;
  triggerClassName: string;
}

const moveActionClassName =
  "flex items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-2 text-sm text-[var(--app-accent)] focus:bg-[var(--app-accent-soft)] focus:text-[var(--app-accent)]";
const moveTargetItemClassName =
  "rounded-[var(--radius-xs)] px-2.5 py-2 text-sm text-[var(--app-text)] focus:bg-[var(--app-accent-soft)] focus:text-[var(--app-accent)] data-[disabled]:pointer-events-none data-[disabled]:opacity-40";
const deleteActionClassName =
  "rounded-[var(--radius-xs)] px-2.5 py-2 text-sm text-[var(--app-text)] focus:bg-[var(--app-accent-soft)] focus:text-[var(--app-text)]";
const contentClassName = "app-popover-surface w-[170px] rounded-[var(--radius-sm)] p-1";
const subContentClassName =
  "app-popover-surface max-h-[260px] min-w-[220px] rounded-[var(--radius-sm)] p-1";

const getParentPath = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

export default function WorkspaceTreeEntryMenu({
  sourcePath,
  entryType,
  moveTargetDirectories,
  actionsDisabled,
  t,
  onCreateFile,
  onCreateFolder,
  onRename,
  onMove,
  onDelete,
  triggerClassName,
}: WorkspaceTreeEntryMenuProps) {
  const currentParentPath = getParentPath(sourcePath);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={actionsDisabled}
          className={triggerClassName}
          title={t("workspace.documentActions.moreActions")}
        >
          <Ellipsis size={11} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={contentClassName}>
        {entryType === "folder" && onCreateFile ? (
          <DropdownMenuItem
            onSelect={onCreateFile}
            className="rounded-[var(--radius-xs)] px-2.5 py-2 text-sm"
          >
            {t("workspace.documentActions.createFileHere")}
          </DropdownMenuItem>
        ) : null}
        {entryType === "folder" && onCreateFolder ? (
          <DropdownMenuItem
            onSelect={onCreateFolder}
            className="rounded-[var(--radius-xs)] px-2.5 py-2 text-sm"
          >
            {t("workspace.documentActions.createFolderHere")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={onRename}
          className="rounded-[var(--radius-xs)] px-2.5 py-2 text-sm"
        >
          {t("workspace.documentActions.rename")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={moveActionClassName}>
            <span>{t("workspace.documentActions.moveTo")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={subContentClassName}>
            {moveTargetDirectories.map((targetDirectory) => {
              const isDisabled =
                targetDirectory === currentParentPath ||
                (entryType === "folder" &&
                  (targetDirectory === sourcePath || targetDirectory.startsWith(`${sourcePath}/`)));

              return (
                <DropdownMenuItem
                  key={`${sourcePath}-${targetDirectory || "root"}`}
                  disabled={isDisabled}
                  onSelect={() => {
                    if (!isDisabled) {
                      onMove(targetDirectory);
                    }
                  }}
                  className={moveTargetItemClassName}
                >
                  {targetDirectory || t("workspace.documentActions.rootDirectory")}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => void onDelete()} className={deleteActionClassName}>
          {t(
            entryType === "file"
              ? "workspace.documentActions.deleteFile"
              : "workspace.documentActions.deleteFolder"
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
