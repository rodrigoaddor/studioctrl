import { ChevronLeft, Circle, RefreshCw } from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ErrorNotice } from "./components/error-notice";
import { AppIcon } from "./components/app-icon";
import { Button } from "./components/ui/button";
import { useStudio } from "./context";
import { Connections } from "./pages/connections";
import { Studio } from "./pages/studio";
export default function App() {
  const { client, status, profile, syncing, error } = useStudio();
  const navigate = useNavigate();
  function exit() {
    client.disconnect();
    navigate("/", { replace: true });
  }
  return (
    <div className="min-h-dvh">
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
          aria-label="StudioCTRL"
          className="flex items-baseline justify-self-center font-heading text-base font-extrabold tracking-[-0.5px]"
        >
          <span className="mr-2 grid place-items-center self-center text-foreground">
            <AppIcon width={24} height={24} />
          </span>
          <span className="text-lg">
            studio<span className="ml-0.5 text-xs font-bold">CTRL</span>
          </span>
        </Link>
        <div className="flex min-w-0 max-w-full items-center justify-self-end gap-3 max-[720px]:gap-2">
          {status === "connected" && (
            <>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground max-[720px]:text-[11px]">
                <Circle size={7} fill="currentColor" className="shrink-0" />
                <span
                  className="truncate max-[600px]:sr-only"
                  title={`Connected to ${profile?.name}`}
                >
                  Connected to {profile?.name}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Refresh OBS state"
                title="Refresh OBS state"
                aria-disabled={syncing}
                onClick={() => {
                  if (!syncing) void client.refresh();
                }}
              >
                <RefreshCw />
              </Button>
            </>
          )}
        </div>
      </header>
      {error && <ErrorNotice message={error} onDismiss={client.clearError} />}
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
