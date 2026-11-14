import { useSyncExternalStore } from "react";
import { readMonitorBorders, saveMonitorBorders, subscribeMonitorSettings } from "../lib/monitor-settings";

export function useMonitorBorders() {
  const enabled = useSyncExternalStore(subscribeMonitorSettings, readMonitorBorders, () => true);
  return [enabled, saveMonitorBorders] as const;
}
