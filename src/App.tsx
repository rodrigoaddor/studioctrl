import {
  ChevronLeft,
  Server,
  Ellipsis,
  Images,
  EyeOff,
  Maximize,
  Minimize,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ErrorNotice } from "./components/error-notice";
import { useOutputStatuses } from "./hooks/use-output-statuses";
import { OutputMenuItems } from "./components/output-menu-items";
import { OutputStopDialog } from "./components/output-stop-dialog";
import { OutputBadges } from "./components/output-badges";
import { AppIcon } from "./components/app-icon";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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
  const session = status === "connected" ? profile : null;
  const { outputs, refreshOutputs } = useOutputStatuses(client, session);
  const [stopTarget, setStopTarget] = useState<{ output: "stream" | "recording"; session: typeof profile } | null>(null);
  const [outputPending, setOutputPending] = useState(false);
  const outputRunning = useRef(false);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const outputDisabled = syncing || busy || !!generating || outputPending;
  const stopping = stopTarget && stopTarget.session === session && session ? stopTarget : null;
  async function setOutput(output: "stream" | "recording", active: boolean) {
    if (outputRunning.current || outputDisabled) return false;
    outputRunning.current = true;
    setOutputPending(true);
    try {
      const success = await client.setOutputActive(output, active);
      refreshOutputs();
      return success;
    } finally {
      outputRunning.current = false;
      setOutputPending(false);
    }
  }
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
        <div className="flex min-w-0 items-center justify-self-start gap-3 max-[720px]:gap-2">
          {status !== "disconnected" && (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={exit}>
              <ChevronLeft />
              {status === "connecting" ? "Cancel" : "Exit"}
            </Button>
          )}
          {status === "connected" && (
            <Badge variant="outline" className="min-w-0 shrink gap-1.5 max-sm:hidden">
              <Server aria-hidden="true" size={14} className="shrink-0" />
              <span
                className="truncate"
                title={`Connected to ${profile?.name}`}
              >
                <span className="max-lg:sr-only">Connected to </span>
                {profile?.name}
              </span>
            </Badge>
          )}
        </div>
        <Link
          to={status === "connected" ? "/studio" : "/"}
          aria-label="StudioCTRL"
          className="flex items-baseline justify-self-center font-heading text-base font-extrabold tracking-[-0.5px]"
        >
          <span className="grid place-items-center self-center text-foreground sm:mr-2">
            <AppIcon width={24} height={24} />
          </span>
          <span className="hidden text-lg sm:inline">
            studio<span className="ml-0.5 text-xs font-bold">CTRL</span>
          </span>
        </Link>
        <div className="flex min-w-0 max-w-full items-center justify-self-end gap-3 max-[720px]:gap-2">
          {status === "connected" && (
            <OutputBadges outputs={outputs} />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                ref={actionsButton}
                aria-label={status === "connected" ? "OBS actions" : "App actions"}
                title={status === "connected" ? "OBS actions" : "App actions"}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 whitespace-nowrap"
              onCloseAutoFocus={(event) => { if (stopping) event.preventDefault(); }}
            >
              {status === "connected" && (
                <>
                  <DropdownMenuLabel className="flex min-w-0 items-center gap-2">
                    <Server className="size-4 shrink-0" />
                    <span className="truncate" title={profile?.name}>Connected to {profile?.name}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup aria-label="Status">
                    <OutputMenuItems outputs={outputs} disabled={outputDisabled} onSelect={(output, active) => {
                      if (active) setStopTarget({ output, session });
                      else void setOutput(output, true);
                    }} />
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger><Images /> Scenes</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-48 whitespace-nowrap">
                      <DropdownMenuCheckboxItem
                        checked={showHiddenScenes}
                        onCheckedChange={client.setShowHiddenScenes}
                      >
                        <EyeOff /> Show hidden scenes
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!studio || syncing || busy || !!generating}
                        onSelect={() => void client.generatePreviews()}
                      >
                        <Images /> Generate Previews
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={syncing || busy || !!generating}
                        onSelect={() => void client.resetPreviews()}
                      >
                        <RotateCcw /> Reset Previews
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                </>
              )}
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
        </div>
      </header>
      {stopping && <OutputStopDialog
        key={`${profile?.id}:${profile?.url}:${stopping.output}`}
        output={stopping.output} device={profile?.name ?? "OBS"} disabled={outputDisabled}
        onStop={() => setOutput(stopping.output, false)}
        onClose={() => setStopTarget(null)}
        onRestoreFocus={() => actionsButton.current?.focus()}
      />}
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
        <Route path="/studio" element={<Studio streaming={outputs?.stream?.active} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
