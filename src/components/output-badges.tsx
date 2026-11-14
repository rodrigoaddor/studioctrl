import { useTranslation } from "react-i18next";
import { Radio, Video } from "lucide-react";
import type { OutputStatus, OutputStatuses } from "../lib/obs";
import { Badge } from "./ui/badge";
import { cn, formatOutputDuration } from "../lib/utils";


function OutputBadge({ label, output, loading }: {
  label: "LIVE" | "REC";
  output: OutputStatus | null;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const state = !output ? (loading ? t("Checking") : t("Unavailable"))
    : !output.active ? t("Inactive")
    : output.paused ? t("Paused")
    : output.reconnecting ? t("Reconnecting") : t("Active");
  const active = !!output?.active;
  const time = output ? formatOutputDuration(active ? output.duration : 0) : "--:--:--";
  const Icon = label === "LIVE" ? Radio : Video;
  return (
    <Badge
      variant="outline"
      role="status"
      aria-label={`${t(label)}: ${state}, ${time}`}
      title={`${t(label)}: ${state}`}
      data-active={active}
      className={cn(
        "bg-muted/30 text-muted-foreground",
        active && "border-program/40 bg-program/10 text-program",
        output?.paused && "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" size={12} />
      <span className="max-lg:sr-only">{t(label)}</span>
      {output?.paused && <span>{t("Paused")}</span>}
      {output?.reconnecting && <span>{t("Reconnecting")}</span>}
      <span className="font-mono tabular-nums max-md:sr-only">{time}</span>
    </Badge>
  );
}

export function OutputBadges({ outputs }: { outputs: OutputStatuses | null }) {
  return (
    <div className="flex items-center gap-2 max-[720px]:gap-1">
      <OutputBadge label="LIVE" output={outputs?.stream ?? null} loading={!outputs} />
      <OutputBadge label="REC" output={outputs?.recording ?? null} loading={!outputs} />
    </div>
  );
}
