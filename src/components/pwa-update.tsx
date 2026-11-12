import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useStudio } from "../context";
import { Button } from "./ui/button";

export function PwaUpdate() {
  const { status } = useStudio();
  const [error, setError] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();

  if (!needRefresh) return null;

  async function update() {
    if (status !== "disconnected" || updating) return;
    setUpdating(true);
    setError(false);
    try {
      await updateServiceWorker();
    } catch {
      setError(true);
      setUpdating(false);
    }
  }

  return (
    <aside
      aria-label="Application update"
      className="fixed right-6 bottom-6 z-40 flex w-[calc(100%-3rem)] max-w-md flex-col gap-3 border border-border bg-popover p-4 text-xs text-popover-foreground shadow-md max-[720px]:right-4 max-[720px]:w-[calc(100%-2rem)]"
    >
      <p role="status">
        Update available. Reloads all open studioctrl windows; disconnect OBS in each window first.
        {status !== "disconnected" && " Exit this session to update."}
      </p>
      {error && <p role="alert">Update failed. Try again when the app server is reachable.</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={status !== "disconnected" || updating} onClick={() => void update()}>
          Reload to update
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>Later</Button>
      </div>
    </aside>
  );
}
