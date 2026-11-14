import { loadProfiles, type Profile } from "./profiles";

const key = "studioctrl.active-session.v1";

// Tab-scoped recovery stores identity only, never credentials or OBS state.
export function rememberActiveSession(profile: Profile | null) {
  try {
    if (profile) sessionStorage.setItem(key, JSON.stringify({ id: profile.id, url: profile.url }));
    else sessionStorage.removeItem(key);
  } catch {
    // Storage restrictions must not prevent ordinary connections.
  }
}

export function loadActiveSession(): Profile | null {
  try {
    const marker: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!marker || typeof marker !== "object" || !("id" in marker) || !("url" in marker)) return null;
    return loadProfiles().find((profile) => profile.id === marker.id && profile.url === marker.url) ?? null;
  } catch {
    return null;
  }
}
