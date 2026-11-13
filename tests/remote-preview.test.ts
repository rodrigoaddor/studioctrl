// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { emptyRemoteSettings, normalizeWhepUrl, readRemoteSettings, remoteAuthorization, saveRemoteSettings, startRemotePreview } from "../src/lib/remote-preview";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });
it("normalizes MediaMTX page and WHEP URLs without putting credentials in them", () => {
  expect(normalizeWhepUrl("https://media.example/live/?key=test")).toBe("https://media.example/live/whep?key=test");
  expect(normalizeWhepUrl("http://localhost:8889/live/whep")).toBe("http://localhost:8889/live/whep");
  for (const url of ["rtsp://example/live", "https://user:secret@example/live", "https://example/live#secret", "invalid"]) {
    expect(() => normalizeWhepUrl(url)).toThrow();
  }
});
it("persists secrets only when opted in and removes them when opted out", () => {
  const settings = { ...emptyRemoteSettings, url: "https://media.example/live", auth: "basic" as const, username: "operator", password: "secret" };
  saveRemoteSettings("persistence", settings);
  expect(localStorage.getItem("studioctrl.remote.v1:persistence")).not.toContain("secret");
  expect(readRemoteSettings("persistence").password).toBe("secret");
  saveRemoteSettings("persistence", { ...settings, remember: true });
  expect(localStorage.getItem("studioctrl.remote.v1:persistence")).toContain("secret");
  saveRemoteSettings("persistence", { ...settings, auth: "none" });
  expect(localStorage.getItem("studioctrl.remote.v1:persistence")).not.toContain("secret");
  expect(readRemoteSettings("other").url).toBe("");
});
it("uses UTF-8 Basic authentication and bearer headers", () => {
  expect(remoteAuthorization({ ...emptyRemoteSettings, auth: "basic", username: "user", password: "café" })).toEqual({ Authorization: "Basic dXNlcjpjYWbDqQ==" });
  expect(remoteAuthorization({ ...emptyRemoteSettings, auth: "bearer", token: "token" })).toEqual({ Authorization: "Bearer token" });
});
function setup() {
  const pc = {
    ontrack: null as ((event: RTCTrackEvent) => void) | null,
    addTransceiver: vi.fn(), createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer" })),
    setLocalDescription: vi.fn(async () => {}), localDescription: { sdp: "gathered offer" },
    iceGatheringState: "complete", addEventListener: vi.fn(), removeEventListener: vi.fn(),
    setRemoteDescription: vi.fn(async () => {}), close: vi.fn(),
  };
  vi.stubGlobal("RTCPeerConnection", vi.fn(function () { return pc; }));
  vi.stubGlobal("MediaStream", vi.fn(function () { return { addTrack: vi.fn(), getTracks: () => [] }; }));
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204, headers: { Link: '<turn:relay.example>; rel="ice-server"; username="u"; credential="p"; credential-type="password"' } }))
    .mockResolvedValueOnce(new Response("answer", { status: 201, headers: { Location: "/live/whep/session" } })).mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  const video = document.createElement("video");
  const error = vi.fn();
  const settings = { ...emptyRemoteSettings, url: "https://media.example/live/whep", auth: "bearer" as const, token: "secret" };
  return { pc, fetcher, video, error, settings };
}
it("negotiates authenticated receive-only WHEP, uses advertised TURN, and releases its session", async () => {
  const { pc, fetcher, video, error, settings } = setup();
  const stop = startRemotePreview(settings, video, error);
  await vi.waitFor(() => expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "answer" }));
  expect(RTCPeerConnection).toHaveBeenCalledWith({ iceServers: [{ urls: "turn:relay.example", username: "u", credential: "p" }] });
  expect(pc.addTransceiver).toHaveBeenCalledWith("video", { direction: "recvonly" });
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "POST", headers: { Authorization: "Bearer secret", "Content-Type": "application/sdp" }, body: "gathered offer", redirect: "error" });
  stop();
  expect(pc.close).toHaveBeenCalled();
  expect(fetcher.mock.calls[2]).toMatchObject(["https://media.example/live/whep/session", { method: "DELETE", headers: { Authorization: "Bearer secret" } }]);
  expect(error).not.toHaveBeenCalled();
});
it("reports authentication failures without echoing server bodies or credentials", async () => {
  const { fetcher, video, settings, error, pc } = setup();
  fetcher.mockReset().mockResolvedValue(new Response("secret", { status: 401 }));
  const stop = startRemotePreview(settings, video, error);
  await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("authentication failed")));
  expect(pc.createOffer).not.toHaveBeenCalled();
  expect(error.mock.calls.flat().join()).not.toContain("secret");
  stop();
});
it("cancels pending discovery without creating a stale peer", async () => {
  const { fetcher, video, settings, error, pc } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockReset().mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
  const stop = startRemotePreview(settings, video, error);
  stop(); resolve(new Response(null, { status: 204 }));
  await Promise.resolve(); await Promise.resolve();
  expect(pc.createOffer).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});
it("does not forward credentials to a cross-origin session URL", async () => {
  const { fetcher, video, settings, error } = setup();
  fetcher.mockReset().mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response("answer", { status: 201, headers: { Location: "https://other.example/session" } }));
  const stop = startRemotePreview(settings, video, error);
  await vi.waitFor(() => expect(error).toHaveBeenCalled());
  stop();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("times out stalled negotiation and closes the peer without scheduling retries", async () => {
  vi.useFakeTimers();
  const { pc, fetcher, video, settings, error } = setup();
  pc.iceGatheringState = "gathering";
  const stop = startRemotePreview(settings, video, error);
  await vi.advanceTimersByTimeAsync(20000);
  expect(error).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  expect(pc.close).toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  stop();
});

it("keeps one video load when audio and video tracks arrive during pending play", async () => {
  const { pc, video, settings, error } = setup();
  let source: MediaProvider | null = null;
  let rejectPlay: ((reason: unknown) => void) | undefined;
  const attach = vi.fn((next: MediaProvider | null) => {
    // Browser source reassignment interrupts a pending play(), even for the same stream.
    rejectPlay?.(new DOMException("The play() request was interrupted by a new load request.", "AbortError"));
    source = next;
  });
  Object.defineProperty(video, "srcObject", { get: () => source, set: attach });
  const play = vi.spyOn(video, "play").mockImplementation(() => new Promise<void>((_, reject) => { rejectPlay = reject; }));
  const stop = startRemotePreview(settings, video, error);
  await vi.waitFor(() => expect(pc.setRemoteDescription).toHaveBeenCalled());
  pc.ontrack!({ track: { kind: "video" } } as RTCTrackEvent);
  pc.ontrack!({ track: { kind: "audio" } } as RTCTrackEvent);
  await Promise.resolve();
  expect(error).not.toHaveBeenCalled();
  expect(attach).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalledTimes(1);
  expect(pc.close).not.toHaveBeenCalled();
  stop();
});
