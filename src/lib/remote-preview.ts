export type RemoteSettings = {
  url: string;
  auth: "none" | "basic" | "bearer";
  username: string;
  password: string;
  token: string;
  remember: boolean;
};
export const emptyRemoteSettings: RemoteSettings = {
  url: "", auth: "none", username: "", password: "", token: "", remember: false,
};
const sessionSettings = new Map<string, RemoteSettings>();
const prefix = "studioctrl.remote.v1:";

export function normalizeWhepUrl(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Enter a valid HTTP or HTTPS WebRTC URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("Use an HTTP or HTTPS URL without embedded credentials or a fragment.");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  if (!url.pathname.endsWith("/whep")) url.pathname += "/whep";
  return url.href;
}
export function readRemoteSettings(key: string): RemoteSettings {
  const session = sessionSettings.get(key);
  if (session) return session;
  try {
    const data = JSON.parse(localStorage.getItem(prefix + key) ?? "null");
    if (!data || typeof data.url !== "string") return emptyRemoteSettings;
    const url = normalizeWhepUrl(data.url);
    return {
      url, auth: ["basic", "bearer"].includes(data.auth) ? data.auth : "none",
      username: typeof data.username === "string" ? data.username : "",
      password: data.remember === true && typeof data.password === "string" ? data.password : "",
      token: data.remember === true && typeof data.token === "string" ? data.token : "",
      remember: data.remember === true,
    };
  } catch { return emptyRemoteSettings; }
}
export function saveRemoteSettings(key: string, settings: RemoteSettings) {
  const clean = {
    ...settings, url: normalizeWhepUrl(settings.url),
    username: settings.auth === "basic" ? settings.username : "",
    password: settings.auth === "basic" ? settings.password : "",
    token: settings.auth === "bearer" ? settings.token : "",
  };
  // A failed write must not leave previously remembered secrets behind.
  localStorage.setItem(prefix + key, JSON.stringify({ ...clean,
    password: clean.remember ? clean.password : "", token: clean.remember ? clean.token : "",
  }));
  sessionSettings.set(key, clean);
  return clean;
}

export function remoteAuthorization(settings: RemoteSettings): Record<string, string> {
  if (settings.auth === "bearer") return { Authorization: `Bearer ${settings.token}` };
  if (settings.auth === "basic") {
    const bytes = new TextEncoder().encode(`${settings.username}:${settings.password}`);
    return { Authorization: `Basic ${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}` };
  }
  return {};
}

// Non-trickle WHEP: gather all local candidates before posting the SDP offer.
export function startRemotePreview(settings: RemoteSettings, video: HTMLVideoElement,
  onError: (message: string) => void, onPlaybackBlocked?: () => void) {
  let stopped = false;
  let pc: RTCPeerConnection | undefined;
  let sessionUrl: string | undefined;
  let cancelGather: (() => void) | undefined;
  const abort = new AbortController();
  const headers = remoteAuthorization(settings);
  let stream: MediaStream | undefined;
  function deleteSession() {
    if (!sessionUrl) return;
    const url = sessionUrl;
    sessionUrl = undefined;
    void fetch(url, { method: "DELETE", headers, credentials: "omit", redirect: "error",
      signal: AbortSignal.timeout(5000), keepalive: true }).catch(() => {});
  }
  function release() {
    abort.abort();
    cancelGather?.();
    pc?.close();
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    deleteSession();
  }
  const timeout = setTimeout(() => fail("WebRTC timed out. Check the stream, codecs, and ICE connectivity."), 20000);
  function fail(message: string) {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    release();
    onError(message);
  }
  async function connect() {
    if (!globalThis.RTCPeerConnection) throw new Error("unsupported");
    stream = new MediaStream();
    // MediaMTX advertises its STUN/TURN configuration through OPTIONS Link headers.
    const options = await fetch(settings.url, { method: "OPTIONS", headers,
      signal: abort.signal, credentials: "omit", redirect: "error" });
    if (stopped) return;
    if (options.status === 401 || options.status === 403) {
      fail("WebRTC authentication failed. Check credentials and stream read permissions."); return;
    }
    if (!options.ok) throw new Error("options");
    const iceServers: RTCIceServer[] = [];
    for (const match of (options.headers.get("Link") ?? "").matchAll(/<([^>]+)>;\s*rel="ice-server"(?:;\s*username="((?:[^"\\]|\\.)*)";\s*credential="((?:[^"\\]|\\.)*)";\s*credential-type="password")?/g)) {
      iceServers.push({ urls: match[1], ...(match[2] !== undefined ? {
        username: JSON.parse(`"${match[2]}"`), credential: JSON.parse(`"${match[3]}"`),
      } : {}) });
    }
    pc = new RTCPeerConnection({ iceServers });
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (event) => {
      if (stopped) { event.track.stop(); return; }
      stream!.addTrack(event.track);
      // Audio and video arrive in separate track events. Reassigning srcObject
      // reloads the element and aborts the first pending play() request.
      if (video.srcObject !== stream) {
        video.srcObject = stream!;
        void video.play().catch((error: unknown) => {
          if (stopped) return;
          if (error instanceof DOMException && error.name === "NotAllowedError" && onPlaybackBlocked) {
            onPlaybackBlocked();
          } else {
            fail("Video playback failed. Retry or check browser codec support.");
          }
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === "connected") clearTimeout(timeout);
      if (pc?.connectionState === "failed" || pc?.connectionState === "disconnected") {
        fail("WebRTC connection lost. Check ICE connectivity and retry.");
      }
    };
    await pc.setLocalDescription(await pc.createOffer());
    if (stopped) return;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (stopped || pc?.iceGatheringState === "complete") {
          pc?.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      cancelGather = check;
      pc!.addEventListener("icegatheringstatechange", check);
      check();
    });
    if (stopped) return;
    const response = await fetch(settings.url, { method: "POST",
      headers: { ...headers, "Content-Type": "application/sdp" }, body: pc.localDescription?.sdp,
      signal: abort.signal, credentials: "omit", redirect: "error" });
    if (response.status !== 201) {
      fail(response.status === 401 || response.status === 403
        ? "WebRTC authentication failed. Check credentials and stream read permissions."
        : response.status === 404 ? "Stream not found. Check the URL and that OBS is publishing."
        : `WebRTC negotiation failed (HTTP ${response.status}).`);
      return;
    }
    const location = response.headers.get("Location");
    if (!location) throw new Error("location");
    const target = new URL(location, settings.url);
    if (target.origin !== new URL(settings.url).origin || target.username || target.password) throw new Error("location");
    sessionUrl = target.href;
    if (stopped) { deleteSession(); return; }
    await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
  }
  void connect().catch(() => fail(globalThis.RTCPeerConnection
    ? "Cannot open WebRTC. Check HTTPS, CORS, server availability, and browser codec support."
    : "WebRTC is unavailable in this browser."));
  return () => { stopped = true; clearTimeout(timeout); release(); };
}
