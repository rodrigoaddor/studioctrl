const prefix = "studioctrl.hidden-scene.v1:";
const volatile = new Map<string, boolean>();

export function isSceneHidden(key: string): boolean {
  if (volatile.has(key)) return volatile.get(key)!;
  try {
    return localStorage.getItem(prefix + key) === "true";
  } catch {
    return false;
  }
}

export function saveSceneHidden(key: string, hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(prefix + key, "true");
    else localStorage.removeItem(prefix + key);
    volatile.delete(key);
  } catch {
    volatile.set(key, hidden);
  }
}
