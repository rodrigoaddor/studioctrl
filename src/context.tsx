import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { StudioClient } from "./lib/obs";
const Context = createContext<StudioClient | null>(null);
export function StudioProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new StudioClient());
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useStudio() {
  const client = useContext(Context);
  if (!client) throw new Error("StudioProvider is missing");
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  return { client, ...state };
}
