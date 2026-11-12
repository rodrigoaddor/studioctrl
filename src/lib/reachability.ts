const timeoutMs = 5_000;

// OBS sends Hello before authentication. This probe never identifies or sends commands.
export function isObsOnline(
  url: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url, "obswebsocket.json");
    } catch {
      resolve(false);
      return;
    }
    let settled = false;
    function finish(online: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      socket.removeEventListener("message", message);
      socket.removeEventListener("error", offline);
      socket.removeEventListener("close", offline);
      // Closing a pending handshake may emit an error; it is already accounted for.
      socket.addEventListener("error", () => {}, { once: true });
      socket.close();
      resolve(online);
    }
    function abort() {
      finish(false);
    }
    function offline() {
      finish(false);
    }
    function message(event: MessageEvent) {
      try {
        const hello = JSON.parse(event.data);
        finish(
          hello?.op === 0 &&
            typeof hello.d?.obsWebSocketVersion === "string" &&
            Number.isInteger(hello.d?.rpcVersion) &&
            hello.d.rpcVersion >= 1,
        );
      } catch {
        finish(false);
      }
    }
    const timer = setTimeout(offline, timeoutMs);
    socket.addEventListener("message", message);
    socket.addEventListener("error", offline);
    socket.addEventListener("close", offline);
    signal.addEventListener("abort", abort, { once: true });
  });
}
