import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readRemoteSettings, type RemoteSettings } from "../lib/remote-preview";
import { RemotePreview, RemotePreviewDialog } from "./remote-preview";
import { Settings } from "lucide-react";
import { useStudio } from "../context";
import { useMonitorMode } from "../hooks/use-monitor-mode";
import { useObsPreview } from "../hooks/use-obs-preview";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function SceneMonitor({
  kind,
  sceneName,
}: {
  kind: "preview" | "program";
  sceneName: string | null;
}) {
  const { profile, status, studio, monitorFade } = useStudio();
  const [finishedFade, setFinishedFade] = useState<typeof monitorFade>(null);
  const fade =
    kind === "program" && status === "connected" && studio && monitorFade &&
    (sceneName === monitorFade.to ||
      (finishedFade !== monitorFade && sceneName === monitorFade.from))
      ? monitorFade
      : null;
  useEffect(() => {
    if (!fade) return;
    const timer = setTimeout(
      () => setFinishedFade(fade),
      Math.max(0, fade.duration - (performance.now() - fade.startedAt)),
    );
    return () => clearTimeout(timer);
  }, [fade]);
  const [mode, setMode] = useMonitorMode(profile?.id ?? "default", kind);
  const settingsKey = `${profile?.id ?? "default"}:${kind}`;
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteOverride, setRemoteOverride] = useState<{ key: string; settings: RemoteSettings } | null>(null);
  const remoteSettings = useMemo(() => remoteOverride?.key === settingsKey ? remoteOverride.settings : readRemoteSettings(settingsKey), [settingsKey, remoteOverride]);
  const [hasImage, setHasImage] = useState(false);
  const continuingFade = fade && mode === "obs";
  const label = kind === "preview" ? "Preview" : "Program";
  function select(value: string) {
    if (value === "remote") { setRemoteOpen(true); return; }
    if (value !== "none" && value !== "obs") return;
    setMode(value);
  }
  return (
    <article
      aria-label={`${label} monitor`}
      className="relative aspect-video w-full min-w-0 overflow-hidden border border-border bg-black text-white"
    >
      {mode !== "remote" && (!continuingFade || finishedFade !== fade) && (
        <MonitorPicture
          kind={kind}
          sceneName={continuingFade ? fade.from : sceneName}
          mode={mode}
          onImageChange={continuingFade ? undefined : setHasImage}
        />
      )}
      {continuingFade && (
          <FadeLayer key={fade.startedAt} fade={fade}>
            <MonitorPicture
              kind="program"
              sceneName={fade.to}
              mode={mode}
              onImageChange={setHasImage}
            />
          </FadeLayer>
      )}
      {mode === "remote" && status === "connected" && studio && <RemotePreview
        key={`player:${settingsKey}`}
        settings={remoteSettings}
        onImageChange={setHasImage}
      />}
      {remoteOpen && <RemotePreviewDialog key={`dialog:${settingsKey}`} settingsKey={settingsKey} label={label}
        onClose={() => { setRemoteOpen(false); settingsButton.current?.focus(); }} onSave={(settings) => {
          setRemoteOverride({ key: settingsKey, settings }); setMode("remote");
        }} />}
      <div className="absolute inset-x-0 top-0 z-10 grid h-9 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center bg-black/60 text-xs">
        <span
          className="flex min-w-0 items-center gap-1.5 pl-3"
          title={
            mode === "obs"
              ? "OBS scene screenshots; transition effects and same-scene Studio edits may differ from the Program output."
              : undefined
          }
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              kind === "preview" ? "bg-preview" : "bg-program",
            )}
          />
          {label}
        </span>
        <span
          className="min-w-0 truncate px-2 text-center"
          title={hasImage ? (mode === "remote" ? "Remote stream" : sceneName ?? undefined) : undefined}
        >
          {hasImage ? (mode === "remote" ? "Remote stream" : sceneName) : null}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              ref={settingsButton}
              aria-label={`${label} settings`}
              className="justify-self-end border-0 text-white shadow-none hover:bg-white/15 hover:text-white focus-visible:bg-white/15 focus-visible:text-white focus-visible:ring-0 aria-expanded:bg-white/15 aria-expanded:text-white dark:hover:bg-white/15"
            >
              <Settings />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={(event) => { if (remoteOpen) event.preventDefault(); }}>
            <DropdownMenuRadioGroup value={mode} onValueChange={select}>
              <DropdownMenuRadioItem value="none">
                No Preview
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="obs">
                OBS Preview
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="remote" onSelect={() => setRemoteOpen(true)}>
                Remote Preview
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}

// Preserve the incoming canvas after the animation so playback never restarts.
function FadeLayer({ fade, children }: {
  fade: NonNullable<ReturnType<typeof useStudio>["monitorFade"]>;
  children: ReactNode;
}) {
  const [elapsed] = useState(() => Math.max(0, performance.now() - fade.startedAt));
  return (
    <div
      className="pointer-events-none absolute inset-0 animate-in fade-in-0 fill-mode-both [animation-timing-function:linear] bg-black"
      style={{
        animationDuration: `${fade.duration}ms`,
        animationDelay: `-${elapsed}ms`,
      }}
      data-program-fade=""
    >
      {children}
    </div>
  );
}

function MonitorPicture({ kind, sceneName, mode, onImageChange }: {
  kind: "preview" | "program";
  sceneName: string | null;
  mode: "none" | "obs";
  onImageChange?: (hasImage: boolean) => void;
}) {
  const { client, status, studio, previewEpoch, thumbnails, previewReady } = useStudio();
  const cached =
    kind === "preview" && mode === "obs" && sceneName
      ? thumbnails[sceneName]
      : undefined;
  const useCached = !!cached && previewReady !== sceneName;
  const { canvas, phase } = useObsPreview(
    client,
    sceneName,
    mode === "obs" && status === "connected" && studio && !useCached,
    previewEpoch,
    kind === "preview",
  );
  const showingCached = !!cached && phase !== "live";
  const hasImage = phase === "live" || !!cached;
  useEffect(() => {
    onImageChange?.(hasImage);
  }, [hasImage, onImageChange]);
  const label = kind === "preview" ? "Preview" : "Program";
  return (
    <>
      {showingCached && (
        <img
          key={`${previewEpoch}:${sceneName}:${cached}`}
          src={cached}
          alt={`Cached preview of ${sceneName}`}
          className="absolute inset-0 size-full object-contain opacity-75"
        />
      )}
      <canvas
        ref={canvas}
        aria-label={`${label} screenshot of ${sceneName ?? "scene"}`}
        className={cn(
          "absolute inset-0 size-full object-contain",
          phase !== "live" && "invisible",
        )}
      />
      {showingCached && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/50 to-transparent"
        />
      )}
      {!hasImage && (
        <div className="absolute inset-0 grid place-items-center px-6 py-12">
          <h2
            className="font-heading line-clamp-3 text-center text-xl font-medium wrap-anywhere max-[720px]:text-base"
            title={sceneName ?? undefined}
          >
            {sceneName ?? `No ${kind} scene`}
          </h2>
        </div>
      )}
      {(showingCached || phase === "loading" || phase === "error") && (
        <span
          role="status"
          className="absolute inset-x-2 bottom-2 text-center text-[11px] text-white/70"
        >
          {showingCached
            ? "Video Preview"
            : phase === "loading"
              ? "Loading preview…"
              : "Preview unavailable · Retrying…"}
        </span>
      )}
    </>
  );
}
