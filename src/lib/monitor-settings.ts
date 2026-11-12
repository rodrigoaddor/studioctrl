export type MonitorMode = "none" | "obs";
type MonitorKind = "preview" | "program";
const prefix = "studioctrl.monitor.v1:";
const listeners = new Set<() => void>();
const volatileModes = new Map<string, MonitorMode>();

export function monitorSettingsKey(profileId: string, kind: MonitorKind) {
  return `${prefix}${profileId}:${kind}`;
}
export function readMonitorMode(key: string): MonitorMode {
  const volatile = volatileModes.get(key);
  if (volatile) return volatile;
  try {
    return localStorage.getItem(key) === "obs" ? "obs" : "none";
  } catch {
    return "none";
  }
}
function writeMonitorMode(key: string, mode: MonitorMode) {
  try {
    localStorage.setItem(key, mode);
    volatileModes.delete(key);
  } catch {
    volatileModes.set(key, mode);
  }
}
function notify() {
  listeners.forEach((listener) => listener());
}
export function saveMonitorMode(key: string, mode: MonitorMode) {
  writeMonitorMode(key, mode);
  notify();
}
export function saveBothMonitorModes(profileId: string, mode: MonitorMode) {
  writeMonitorMode(monitorSettingsKey(profileId, "preview"), mode);
  writeMonitorMode(monitorSettingsKey(profileId, "program"), mode);
  notify();
}
export function subscribeMonitorSettings(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && !event.key.startsWith(prefix)) return;
    if (event.key === null) volatileModes.clear();
    else volatileModes.delete(event.key);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
