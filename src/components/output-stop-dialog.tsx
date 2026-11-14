import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./ui/alert-dialog";

export function OutputStopDialog({ output, device, disabled, onStop, onClose, onRestoreFocus }: {
  output: "stream" | "recording";
  device: string;
  disabled: boolean;
  onStop: () => Promise<boolean>;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const running = useRef(false);
  async function stop() {
    if (running.current || disabled) return;
    running.current = true;
    setPending(true);
    setError(false);
    try {
      if (await onStop()) onClose();
      else setError(true);
    } catch {
      setError(true);
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return <AlertDialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}
      onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }}>
      <AlertDialogHeader>
        <AlertDialogTitle>{t(output === "stream" ? "Stop streaming?" : "Stop recording?")}</AlertDialogTitle>
        <AlertDialogDescription>{t(output === "stream" ? "This will stop streaming on {{device}}." : "This will stop recording on {{device}}.", { device })}</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="text-xs text-destructive">{t(output === "stream" ? "Could not stop streaming. Please try again." : "Could not stop recording. Please try again.")}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{t("Cancel")}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={pending || disabled}
          onClick={(event) => { event.preventDefault(); void stop(); }}>
          {pending ? t("Stopping…") : t(output === "stream" ? "Stop streaming" : "Stop recording")}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
