import { useTranslation } from "react-i18next";
import { useRef } from "react";
import { ContextMenu } from "radix-ui";
import { Check, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { ConnectionStatus } from "./connection-status";
import type { Profile } from "../lib/profiles";

export function ConnectionCard({
  profile,
  connecting,
  disabled,
  connected,
  onConnect,
  onEdit,
  onDelete,
}: {
  profile: Profile;
  connecting: boolean;
  disabled: boolean;
  connected: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const contextGesture = useRef(false);
  return (
    <ContextMenu.Root
      modal={false}
      onOpenChange={(open) => {
        if (open) contextGesture.current = true;
      }}
    >
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t(connected ? "Open studio for {{name}}" : "Connect to {{name}}", { name: profile.name })}
          aria-disabled={disabled}
          aria-busy={connecting}
          onPointerDownCapture={() => {
            contextGesture.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              contextGesture.current = false;
            if (
              event.key === "ContextMenu" ||
              (event.shiftKey && event.key === "F10")
            ) {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              event.currentTarget.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  cancelable: true,
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                }),
              );
            }
          }}
          onClick={() => {
            if (!disabled && !contextGesture.current) onConnect();
          }}
          className="w-full min-w-0 cursor-pointer border border-border bg-card p-4 text-left text-card-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:cursor-default"
        >
          <span className="mb-1.5 flex items-start justify-between gap-2">
            <span className="font-heading min-w-0 text-[15px] font-medium wrap-anywhere">
              {profile.name}
            </span>
            <ConnectionStatus
              key={profile.url}
              url={profile.url}
              name={profile.name}
            />
          </span>
          <span className="block font-mono text-xs text-muted-foreground wrap-anywhere">
            {profile.url}
          </span>
          <span className="mt-3.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {connecting ? (
              <>
                <LoaderCircle className="size-3.5 animate-spin" /> {t("Connecting…")} </>
            ) : profile.rememberPassword ? (
              <>
                <Check size={13} /> {t("Password remembered")} </>
            ) : (
              t("Ask for password")
            )}
          </span>
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-44 rounded-none bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <ContextMenu.Item
            onSelect={onEdit}
            className="flex cursor-default items-center gap-2 px-2 py-2 text-xs outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
          >
            <Pencil className="size-4" /> {t("Edit connection")}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onDelete}
            className="flex cursor-default items-center gap-2 px-2 py-2 text-xs text-destructive outline-hidden select-none focus:bg-accent"
          >
            <Trash2 className="size-4" /> {t("Delete connection")}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
