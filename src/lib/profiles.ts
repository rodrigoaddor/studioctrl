export interface Profile {
  id: string;
  name: string;
  url: string;
  rememberPassword: boolean;
  password?: string;
}

const key = "studioctrl.connections.v1";

export function normalizeUrl(value: string) {
  const url = new URL(value.trim());
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(
      "Enter a ws:// or wss:// address without credentials or a fragment.",
    );
  }
  return url.href;
}

export function loadProfiles(): Profile[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored
      .filter(
        (p): p is Profile =>
          p &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.url === "string" &&
          typeof p.rememberPassword === "boolean",
      )
      .flatMap((p) => {
        try {
          return [
            {
              id: p.id,
              name: p.name,
              url: normalizeUrl(p.url),
              rememberPassword: p.rememberPassword,
              ...(p.rememberPassword && typeof p.password === "string"
                ? { password: p.password }
                : {}),
            },
          ];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: Profile[]) {
  localStorage.setItem(
    key,
    JSON.stringify(
      profiles.map(({ password, ...p }) => ({
        ...p,
        ...(p.rememberPassword ? { password } : {}),
      })),
    ),
  );
}
