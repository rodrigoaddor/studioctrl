import { Cast, ChevronLeft, Circle, RefreshCw, X } from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Button } from "./components/ui/button";
import { useStudio } from "./context";
import { Connections } from "./pages/connections";
import { Studio } from "./pages/studio";
export default function App() {
  const { client, status, syncing, error } = useStudio();
  const navigate = useNavigate();
  function exit() {
    client.disconnect();
    navigate("/", { replace: true });
  }
  return (
    <div className="min-h-screen">
      <header className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-border px-6 max-[720px]:px-4">
        <div className="justify-self-start">
          {status !== "disconnected" && (
            <Button variant="ghost" size="sm" onClick={exit}>
              <ChevronLeft />
              {status === "connecting" ? "Cancel" : "Exit"}
            </Button>
          )}
        </div>
        <Link
          to={status === "connected" ? "/studio" : "/"}
          className="flex items-center justify-self-center text-base font-semibold tracking-[-0.5px]"
        >
          <span className="mr-2 grid place-items-center text-foreground">
            <Cast size={20} />
          </span>
          studio<span className="font-normal">ctrl</span>
        </Link>
        <div className="flex items-center justify-self-end gap-3 max-[720px]:gap-2">
          {status === "connected" && (
            <>
              <span className="flex items-center gap-1.5 text-xs text-foreground max-[720px]:text-[11px]">
                <Circle size={7} fill="currentColor" />
                <span className="max-[600px]:sr-only">Connected to OBS</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh OBS state"
                title="Refresh OBS state"
                disabled={syncing}
                onClick={() => void client.refresh()}
              >
                <RefreshCw className={syncing ? "animate-spin" : ""} />
              </Button>
            </>
          )}
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="mx-auto mt-4 flex w-[calc(100%-3rem)] max-w-[1200px] items-center justify-between max-[720px]:w-[calc(100%-2rem)] border border-[color-mix(in_oklch,var(--destructive)_40%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_8%,var(--background))] px-3 py-2.5 text-xs text-destructive"
        >
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss error"
            onClick={client.clearError}
          >
            <X />
          </Button>
        </div>
      )}
      <Routes>
        <Route
          path="/"
          element={
            status === "connected" ? (
              <Navigate to="/studio" replace />
            ) : (
              <Connections />
            )
          }
        />
        <Route path="/studio" element={<Studio />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
