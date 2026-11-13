import {
  ChevronLeft,
  Circle,
  RefreshCw,
  Ellipsis,
  Images,
  EyeOff,
  Maximize,
  Minimize,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ErrorNotice } from "./components/error-notice";
import { AppIcon } from "./components/app-icon";
import { Button } from "./components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { useStudio } from "./context";
import { Connections } from "./pages/connections";
import { Studio } from "./pages/studio";
export default function App() {
  const {
    client,
    status,
    profile,
    syncing,
    busy,
    studio,
    generating,
    error,
    showHiddenScenes,
  } = useStudio();
  const navigate = useNavigate();
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  async function toggleFullscreen() {
    setFullscreenError(null);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setFullscreenError("Could not change fullscreen mode. Please try again.");
    }
  }
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="OBS actions"
                    title="OBS actions"
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 whitespace-nowrap"
                >
                  <DropdownMenuItem
                    disabled={syncing || busy || !!generating}
                    onSelect={() => void client.refresh()}
                  >
                    <RefreshCw /> Refresh OBS state
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!studio || syncing || busy || !!generating}
                    onSelect={() => void client.generatePreviews()}
                  >
                    <Images /> Generate Previews
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={showHiddenScenes}
                    onCheckedChange={client.setShowHiddenScenes}
                  >
                    <EyeOff /> Show hidden scenes
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={
                      fullscreen
                        ? typeof document.exitFullscreen !== "function"
                        : !document.fullscreenEnabled ||
                          typeof document.documentElement.requestFullscreen !== "function"
                    }
                    onSelect={() => void toggleFullscreen()}
                  >
                    {fullscreen ? <Minimize /> : <Maximize />}
                    {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </header>
      {generating && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 border border-border bg-popover px-4 py-2 text-xs text-popover-foreground"
        >
          Generating previews {generating.completed}/{generating.total} ·{" "}
          {generating.scene}
        </div>
      )}
      {error && <ErrorNotice message={error} onDismiss={client.clearError} />}
      {!error && fullscreenError && (
        <ErrorNotice
          message={fullscreenError}
          onDismiss={() => setFullscreenError(null)}
        />
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
