import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isObsOnline } from "../src/lib/reachability";

class Socket extends EventTarget {
  static latest: Socket;
  close = vi.fn();
  send = vi.fn();
  constructor(
    public url: string,
    public protocol: string,
  ) {
    super();
    Socket.latest = this;
  }
  message(data: string) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const url = "ws://localhost:4455";
it.each([undefined, { salt: "salt", challenge: "challenge" }])(
  "recognizes OBS Hello without authenticating: %j",
  async (authentication) => {
    const result = isObsOnline(url, new AbortController().signal);
    const socket = Socket.latest;
    socket.message(
      JSON.stringify({
        op: 0,
        d: { obsWebSocketVersion: "5.5.0", rpcVersion: 1, authentication },
      }),
    );
    expect(await result).toBe(true);
    expect(socket.protocol).toBe("obswebsocket.json");
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  },
);
it.each([
  "not JSON",
  "{}",
  '{"op":0,"d":{"rpcVersion":1}}',
  '{"op":0,"d":{"obsWebSocketVersion":"5","rpcVersion":0}}',
])("rejects non-OBS responses: %s", async (data) => {
  const result = isObsOnline(url, new AbortController().signal);
  Socket.latest.message(data);
  expect(await result).toBe(false);
  expect(Socket.latest.close).toHaveBeenCalledOnce();
});
it("times out even if the websocket opens without an OBS Hello", async () => {
  const result = isObsOnline(url, new AbortController().signal);
  Socket.latest.dispatchEvent(new Event("open"));
  await vi.advanceTimersByTimeAsync(5_000);
  expect(await result).toBe(false);
  expect(Socket.latest.close).toHaveBeenCalledOnce();
});
it.each(["error", "close"])(
  "marks a socket %s offline and ignores late messages",
  async (event) => {
    const result = isObsOnline(url, new AbortController().signal);
    Socket.latest.dispatchEvent(new Event(event));
    Socket.latest.message(
      '{"op":0,"d":{"obsWebSocketVersion":"5","rpcVersion":1}}',
    );
    expect(await result).toBe(false);
    expect(Socket.latest.close).toHaveBeenCalledOnce();
  },
);
it("closes the socket and clears its timeout when cancelled", async () => {
  const controller = new AbortController();
  const result = isObsOnline(url, controller.signal);
  controller.abort();
  expect(await result).toBe(false);
  expect(Socket.latest.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("handles browser security restrictions or invalid URLs", async () => {
  vi.stubGlobal(
    "WebSocket",
    class {
      constructor() {
        throw new DOMException("Blocked", "SecurityError");
      }
    },
  );
  expect(await isObsOnline(url, new AbortController().signal)).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
