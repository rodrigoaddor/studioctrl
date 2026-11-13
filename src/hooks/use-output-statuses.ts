import { useEffect, useRef, useState } from "react";
import type { OutputStatuses, StudioClient } from "../lib/obs";

export function useOutputStatuses(client: StudioClient, session: object | null) {
  const [result, setResult] = useState<{ session: object; outputs: OutputStatuses } | null>(null);
  const refresh = useRef(() => {});
  useEffect(() => {
    if (!session) return;
    const currentSession = session;
    let cancelled = false;
    let pending = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      clearTimeout(timer);
      if (cancelled || document.hidden) return;
      if (pending) { again = true; return; }
      pending = true;
      try {
        const outputs = await client.getOutputStatuses();
        if (!cancelled) setResult({ session: currentSession, outputs });
      } catch {
        if (!cancelled) setResult({ session: currentSession, outputs: { stream: null, recording: null } });
      } finally {
        pending = false;
        if (!cancelled) {
          timer = setTimeout(poll, again ? 0 : 1000);
          again = false;
        }
      }
    }
    const update = () => { void poll(); };
    refresh.current = update;
    document.addEventListener("visibilitychange", update);
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      refresh.current = () => {};
      document.removeEventListener("visibilitychange", update);
    };
  }, [client, session]);
  return { outputs: result?.session === session ? result?.outputs ?? null : null, refreshOutputs: () => refresh.current() };
}
