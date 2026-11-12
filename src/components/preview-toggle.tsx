import { useStudio } from "../context";
import { useMonitorMode } from "../hooks/use-monitor-mode";
import { saveBothMonitorModes } from "../lib/monitor-settings";
import { Button } from "./ui/button";

export function PreviewToggle() {
  const { profile } = useStudio();
  const profileId = profile?.id ?? "default";
  const [preview] = useMonitorMode(profileId, "preview");
  const [program] = useMonitorMode(profileId, "program");
  const bothEnabled = preview === "obs" && program === "obs";
  const label = bothEnabled ? "Hide Previews" : "Show Previews";
  return (
    <Button
      variant="outline"
      className="w-full"
      aria-label={label}
      title={label}
      aria-pressed={bothEnabled}
      onClick={() =>
        saveBothMonitorModes(profileId, bothEnabled ? "none" : "obs")
      }
    >
      {label}
    </Button>
  );
}
