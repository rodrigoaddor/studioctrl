import { useTranslation } from "react-i18next";
import { Radio, Video } from "lucide-react";
import type { OutputStatuses } from "../lib/obs";
import { formatOutputDuration } from "../lib/utils";
import { DropdownMenuItem } from "./ui/dropdown-menu";

export function OutputMenuItems({ outputs, disabled, onSelect }: {
  outputs: OutputStatuses | null;
  disabled: boolean;
  onSelect: (output: "stream" | "recording", active: boolean) => void;
}) {
  const { t } = useTranslation();
  return <>{(["stream", "recording"] as const).map((key) => {
    const output = outputs?.[key];
    const Icon = key === "stream" ? Radio : Video;
    return <DropdownMenuItem key={key} disabled={disabled || !output}
      aria-label={output?.active ? `${key === "stream" ? t("Streaming") : t("Recording")} ${formatOutputDuration(output.duration)}` : undefined}
      onSelect={() => { if (output) onSelect(key, output.active); }}>
      <Icon />
      <span>{!output
        ? key === "stream"
          ? t(outputs ? "Streaming unavailable" : "Streaming checking…")
          : t(outputs ? "Recording unavailable" : "Recording checking…")
        : output.active ? t(key === "stream" ? "Streaming" : "Recording")
        : t(key === "stream" ? "Start streaming" : "Start recording")}</span>
      {output?.active && <span className="ml-auto font-mono tabular-nums">{formatOutputDuration(output.duration)}</span>}
    </DropdownMenuItem>;
  })}</>;
}
