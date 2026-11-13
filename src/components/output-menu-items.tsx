import { Radio, Video } from "lucide-react";
import type { OutputStatuses } from "../lib/obs";
import { formatOutputDuration } from "../lib/utils";
import { DropdownMenuItem } from "./ui/dropdown-menu";

export function OutputMenuItems({ outputs, disabled, onSelect }: {
  outputs: OutputStatuses | null;
  disabled: boolean;
  onSelect: (output: "stream" | "recording", active: boolean) => void;
}) {
  return <>{(["stream", "recording"] as const).map((key) => {
    const output = outputs?.[key];
    const label = key === "stream" ? "streaming" : "recording";
    const Icon = key === "stream" ? Radio : Video;
    return <DropdownMenuItem key={key} disabled={disabled || !output}
      aria-label={output?.active ? `${key === "stream" ? "Streaming" : "Recording"} ${formatOutputDuration(output.duration)}` : undefined}
      onSelect={() => { if (output) onSelect(key, output.active); }}>
      <Icon />
      <span>{!output ? `${label === "streaming" ? "Streaming" : "Recording"} ${outputs ? "unavailable" : "checking…"}`
        : output.active ? (key === "stream" ? "Streaming" : "Recording") : `Start ${label}`}</span>
      {output?.active && <span className="ml-auto font-mono tabular-nums">{formatOutputDuration(output.duration)}</span>}
    </DropdownMenuItem>;
  })}</>;
}
