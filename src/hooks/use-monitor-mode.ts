import { useSyncExternalStore } from "react";
import {
  monitorSettingsKey,
  readMonitorMode,
  saveMonitorMode,
  subscribeMonitorSettings,
  type MonitorMode,
} from "../lib/monitor-settings";

export function useMonitorMode(profileId: string, kind: "preview" | "program") {
  const key = monitorSettingsKey(profileId, kind);
  const mode = useSyncExternalStore(
    subscribeMonitorSettings,
    () => readMonitorMode(key),
    (): MonitorMode => "none",
  );
  return [mode, (value: MonitorMode) => saveMonitorMode(key, value)] as const;
}
