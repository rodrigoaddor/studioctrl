import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readRemoteSettings, type RemoteSettings } from "../lib/remote-preview";
import { RemotePreview, RemotePreviewDialog } from "./remote-preview";
import { ExpandableMonitor } from "./expandable-monitor";
import { Maximize, Minimize, MonitorPlay } from "lucide-react";
import { useStudio } from "../context";
import { useMonitorMode } from "../hooks/use-monitor-mode";
import { useMonitorBorders } from "../hooks/use-monitor-borders";
import { useObsPreview } from "../hooks/use-obs-preview";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function SceneMonitor({
  kind,
  sceneName,
  streaming,
}: {
  kind: "preview" | "program";
  sceneName: string | null;
  streaming?: boolean;
}) {
  const { t } = useTranslation();
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
  const [showBorders] = useMonitorBorders();
  const accented = showBorders && mode !== "none";
  const headerForeground = kind === "preview"
    ? "text-preview-foreground hover:text-preview-foreground focus-visible:text-preview-foreground aria-expanded:text-preview-foreground"
    : "text-program-foreground hover:text-program-foreground focus-visible:text-program-foreground aria-expanded:text-program-foreground";
  const headerButtonColors = accented
    ? cn("hover:bg-black/15 focus-visible:bg-black/15 aria-expanded:bg-black/15 dark:hover:bg-black/15", headerForeground)
    : "text-white hover:bg-white/15 hover:text-white focus-visible:bg-white/15 focus-visible:text-white aria-expanded:bg-white/15 aria-expanded:text-white dark:hover:bg-white/15";
  const settingsKey = `${profile?.id ?? "default"}:${kind}`;
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteOverride, setRemoteOverride] = useState<{ key: string; settings: RemoteSettings } | null>(null);
  const remoteSettings = useMemo(() => remoteOverride?.key === settingsKey ? remoteOverride.settings : readRemoteSettings(settingsKey), [settingsKey, remoteOverride]);
  const [expanded, setExpanded] = useState(false);
  const [, setHasImage] = useState(false);
  const continuingFade = fade && mode === "obs";
  const label = kind === "preview" ? t("Preview") : t("Program");
  function select(value: string) {
    if (value === "remote" && !remoteSettings.url) { setRemoteOpen(true); return; }
    if (value !== "none" && value !== "obs" && value !== "remote") return;
    setMode(value);
  }
  return (
    <article
      aria-label={t("{{label}} monitor", { label: label })}
      className={cn(
        "relative w-full min-w-0 overflow-hidden border border-border bg-black text-white max-sm:mx-auto max-sm:max-w-sm",
      )}
    >
      <ExpandableMonitor compact={mode === "none"} expanded={expanded} onExpandedChange={setExpanded} label={label} header={
      <div className={cn(
        "grid h-9 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center bg-black/60 text-xs",
        "relative min-w-0 flex-1",
        accented && "font-medium",
        accented && (kind === "preview" ? "bg-preview text-preview-foreground" : "bg-program text-program-foreground"),
      )}>
        <span
          className="flex min-w-0 items-center gap-1.5 pl-3"
          title={
            mode === "obs"
              ? t("OBS scene screenshots; transition effects and same-scene Studio edits may differ from the Program output.")
              : undefined
          }
        >
          {!showBorders && (
            <span
              aria-hidden="true"
              className={cn("size-1.5 shrink-0 rounded-full", kind === "preview" ? "bg-preview" : "bg-program")}
            />
          )}
          {label}
        </span>
        <span
          className="min-w-0 truncate px-2 text-center"
          title={sceneName ?? undefined}
        >
          {sceneName ?? t(kind === "preview" ? "No preview scene" : "No program scene")}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              ref={settingsButton}
              aria-label={t("{{label}} settings", { label })}
              className={cn("col-start-3 justify-self-end border-0 shadow-none focus-visible:ring-0", headerButtonColors)}
            >
              <MonitorPlay />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={(event) => { if (remoteOpen) event.preventDefault(); }}>
            <DropdownMenuRadioGroup value={mode} onValueChange={select}>
              <DropdownMenuRadioItem value="none">{t("No Preview")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="obs">{t("OBS Preview")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="remote">{t("Remote Preview")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setRemoteOpen(true)}>{t("Configure Remote Preview…")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button data-monitor-expand="" variant="ghost" size="icon-lg" aria-label={expanded ? t("Collapse preview") : t("Expand preview")}
          title={expanded ? t("Collapse preview") : t("Expand preview")}
          className={cn("border-0", headerButtonColors)}
          onClick={() => setExpanded(!expanded)}>
          {expanded ? <Minimize /> : <Maximize />}
        </Button>
      </div>
      }>
      {accented && (
        <div
          aria-hidden="true"
          data-monitor-border={kind}
          className={cn("pointer-events-none absolute inset-0 z-10 border-x-3 border-b-3", kind === "preview" ? "border-preview" : "border-program")}
        />
      )}
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
        streaming={streaming}
        expanded={expanded}
        onImageChange={setHasImage}
      />}
      {remoteOpen && <RemotePreviewDialog key={`dialog:${settingsKey}`} settingsKey={settingsKey} label={label}
        onRestoreFocus={() => settingsButton.current?.focus()}
        onClose={() => setRemoteOpen(false)} onSave={(settings) => {
          setRemoteOverride({ key: settingsKey, settings }); setMode("remote");
        }} />}

      </ExpandableMonitor>
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
  const { t } = useTranslation();
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
  const label = kind === "preview" ? t("Preview") : t("Program");
  return (
    <>
      {showingCached && (
        <img
          key={`${previewEpoch}:${sceneName}:${cached}`}
          src={cached}
          alt={t("Cached preview of {{scene}}", { scene: sceneName })}
          draggable={false}
          className="absolute inset-0 size-full object-contain opacity-75"
        />
      )}
      <canvas
        ref={canvas}
        aria-label={t("{{label}} screenshot of {{scene}}", { label, scene: sceneName ?? t("scene") })}
        className={cn(
          "absolute inset-0 size-full object-contain",
          phase !== "live" && "invisible",
        )}
      />
      {showingCached && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-black/90 via-black/60 via-40% to-transparent"
        />
      )}
      {!hasImage && (
        <div className={cn("absolute inset-0 grid place-items-center px-6 py-12", mode === "none" && "max-sm:hidden")}>
          <h2
            className="font-heading line-clamp-3 text-center text-xl font-medium wrap-anywhere max-[720px]:text-base"
            title={sceneName ?? undefined}
          >
            {sceneName ?? t(kind === "preview" ? "No preview scene" : "No program scene")}
          </h2>
        </div>
      )}
      {(showingCached || phase === "loading" || phase === "error") && (
        <span
          role="status"
          className="absolute inset-x-2 bottom-1 text-center text-[11px] text-white/70"
        >
          {showingCached
            ? t("Video Preview")
            : phase === "loading"
              ? t("Loading preview…")
              : t("Preview unavailable · Retrying…")}
        </span>
      )}
    </>
  );
}
