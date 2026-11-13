import { useStudio } from "../context";
import { useMonitorMode } from "../hooks/use-monitor-mode";
import { enableBothMonitors, saveBothMonitorModes } from "../lib/monitor-settings";
import { Button } from "./ui/button";

export function PreviewToggle() {
  const { profile } = useStudio();
  const profileId = profile?.id ?? "default";
  const [preview] = useMonitorMode(profileId, "preview");
  const [program] = useMonitorMode(profileId, "program");
  const bothEnabled = preview !== "none" && program !== "none";
  const label = bothEnabled ? "Hide Previews" : "Show Previews";
  return (
    <Button
      variant="outline"
      className="w-full"
      aria-label={label}
      title={label}
      aria-pressed={bothEnabled}
      onClick={() =>
        bothEnabled ? saveBothMonitorModes(profileId, "none") : enableBothMonitors(profileId)
      }
    >
      {label}
    </Button>
  );
}
