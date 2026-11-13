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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const running = useRef(false);
  const label = output === "stream" ? "streaming" : "recording";
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
        <AlertDialogTitle>Stop {label}?</AlertDialogTitle>
        <AlertDialogDescription>This will stop {label} on {device}.</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="text-xs text-destructive">Could not stop {label}. Please try again.</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={pending || disabled}
          onClick={(event) => { event.preventDefault(); void stop(); }}>
          {pending ? "Stopping…" : `Stop ${label}`}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
