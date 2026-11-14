import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { StudioClient } from "./lib/obs";
import { loadActiveSession, rememberActiveSession } from "./lib/active-session";
const Context = createContext<{ client: StudioClient; restoring: boolean } | null>(null);
export function StudioProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new StudioClient());
  const [restoreProfile] = useState(loadActiveSession);
  const [restoring, setRestoring] = useState(!!restoreProfile);
  const restoreAttempt = useRef<Promise<void> | null>(null);
  const restorePending = useRef(!!restoreProfile);
  useEffect(() => {
    let previous = client.getSnapshot();
    return client.subscribe(() => {
      const next = client.getSnapshot();
      if (next.status === "disconnected" && previous.status !== "disconnected") {
        restorePending.current = false;
        setRestoring(false);
      }
      previous = next;
    });
  }, [client]);
  useEffect(() => {
    if (!restoreProfile) {
      rememberActiveSession(null);
      return;
    }
    let mounted = true;
    // Reuse the attempt during StrictMode effect replay.
    restoreAttempt.current ??= client.connect(restoreProfile, restoreProfile.password ?? "");
    const timer = setTimeout(() => {
      if (!restorePending.current) return;
      restorePending.current = false;
      client.disconnect();
      setRestoring(false);
    }, 10_000);
    const finish = () => {
      if (!mounted) return;
      clearTimeout(timer);
      const state = client.getSnapshot();
      if (restorePending.current && (state.status !== "connected" || state.error)) client.disconnect();
      restorePending.current = false;
      setRestoring(false);
    };
    void restoreAttempt.current.then(finish, finish);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [client, restoreProfile]);
  return <Context.Provider value={{ client, restoring }}>{children}</Context.Provider>;
}
export function useStudio() {
  const context = useContext(Context);
  if (!context) throw new Error("StudioProvider is missing");
  const { client, restoring } = context;
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  return { client, restoring, ...state };
}
