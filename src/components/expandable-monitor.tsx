import { useTranslation } from "react-i18next";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "radix-ui";

// Keep one portal host so moving the monitor never remounts its video/player.
export function ExpandableMonitor({ expanded, onExpandedChange, label, header, children, compact }: {
  expanded: boolean; onExpandedChange: (expanded: boolean) => void;
  compact: boolean; label: string; header: ReactNode; children: ReactNode;
}) {
  const { t } = useTranslation();
  const [host] = useState(() => {
    const element = document.createElement("div");
    
    return element;
  });
  const inline = useRef<HTMLDivElement>(null);
  const enlarged = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    (expanded ? enlarged.current : inline.current)?.appendChild(host);
  }, [expanded, host, compact]);
  return <Dialog.Root open={expanded} onOpenChange={onExpandedChange}>
    <div ref={inline}>
      {expanded && <><div className="h-9" /><div className={compact ? "aspect-video max-sm:hidden" : "aspect-video"} /></>}
    </div>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/80" />
      <Dialog.Content aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          host.querySelector<HTMLButtonElement>('[data-monitor-expand]')?.focus();
        }}
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest('[role="menu"], [role="dialog"]')) event.preventDefault();
        }}
        className="fixed top-1/2 left-1/2 z-50 w-[min(calc(100vw-1.5rem),calc((100dvh-4rem)*16/9))] -translate-x-1/2 -translate-y-1/2 border border-border bg-black text-white shadow-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          host.querySelector<HTMLButtonElement>('[data-monitor-expand]')?.focus();
        }}>
        <Dialog.Title className="sr-only">{t("{{label}} monitor", { label: label })}</Dialog.Title>
        <div ref={(element) => { enlarged.current = element; if (element && host.parentElement !== element) element.appendChild(host); }} className="min-w-0" />
      </Dialog.Content>
    </Dialog.Portal>
    {createPortal(<div className="flex flex-col">
      <div className="flex shrink-0 items-center">
        {header}

      </div>
      <div className={!expanded && compact ? "relative aspect-video w-full max-sm:hidden" : "relative aspect-video w-full"}>{children}</div>
    </div>, host)}
  </Dialog.Root>;
}
