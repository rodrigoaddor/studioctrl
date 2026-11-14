import { useTranslation } from "react-i18next";
import { useEffect, useId, useRef, useState } from "react";
import { useStudio } from "../context";
import type { ActiveMedia } from "../lib/obs";
import { ErrorNotice } from "./error-notice";
import { ChevronDown, ChevronRight, Pause, Play, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";

const collapsedStorageKey = "studioctrl.active-media.collapsed.v1";

function time(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) return "--:--";
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type PlaybackAction = "play" | "pause" | "stop";
type PendingPlayback = { state: string; acknowledged: boolean };

function MediaSeeker({ media, stale, optimisticCursor, playbackPending, onPlayback, onSeek }: {
  media: ActiveMedia;
  stale: boolean;
  optimisticCursor?: number;
  playbackPending: boolean;
  onPlayback: (name: string, action: PlaybackAction) => void;
  onSeek: (name: string, cursor: number) => void;
}) {
  const { t } = useTranslation();
  const { busy, syncing } = useStudio();
  const [draft, setDraft] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const pending = useRef<number | null>(null);
  const sharedNoteId = useId();
  const dragTimeId = useId();
  const shared = media.preview && media.program;
  const available = !stale && media.duration !== null && Number.isFinite(media.duration) && media.duration > 0 &&
    ["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED"].includes(media.state);
  const blocked = busy || syncing || playbackPending;
  const showDragTime = dragging && available && !blocked;
  const playing = media.state === "OBS_MEDIA_STATE_PLAYING";
  const canPlayPause = !stale && ["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED", "OBS_MEDIA_STATE_STOPPED", "OBS_MEDIA_STATE_ENDED"].includes(media.state);
  const canStop = !stale && ["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED", "OBS_MEDIA_STATE_OPENING", "OBS_MEDIA_STATE_BUFFERING"].includes(media.state);
  const stopped = media.state === "OBS_MEDIA_STATE_STOPPED";
  const displayedDuration = stopped ? null : media.duration;
  const displayedCursor = stopped ? null : draft ?? optimisticCursor ?? media.cursor;
  const cursor = Math.max(0, Math.min(displayedCursor ?? 0, displayedDuration ?? 0));
  const commit = () => {
    const value = pending.current;
    pending.current = null;
    setDraft(null);
    setDragging(false);
    if (value !== null && available && !blocked) onSeek(media.name, value);
  };
  const cancel = () => {
    pending.current = null;
    setDraft(null);
    setDragging(false);
  };
  return (
    <div className="grid min-w-0 gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center justify-between gap-4 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium" title={media.name}>{media.name}</span>
          {media.preview && <span className="shrink-0 text-preview">{t("Preview")}</span>}
          {media.program && <span className="shrink-0 text-program">{t("Program")}</span>}
        </div>
        <span className="shrink-0 font-mono text-muted-foreground tabular-nums">{time(displayedCursor)} / {time(displayedDuration)}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="icon-lg"
            aria-label={`${playing ? t("Pause") : t("Play")} ${media.name}`}
            title={playing ? t("Pause") : t("Play")}
            aria-describedby={shared ? sharedNoteId : undefined}
            aria-disabled={blocked || !canPlayPause}
            disabled={!canPlayPause}
            onClick={() => {
              if (!blocked && canPlayPause) onPlayback(media.name, playing ? "pause" : "play");
            }}
          >
            {playing ? <Pause className="size-4.5" aria-hidden="true" /> : <Play className="size-4.5" aria-hidden="true" />}
          </Button>
          <Button
            variant="outline"
            size="icon-lg"
            aria-label={t("Stop {{name}}", { name: media.name })}
            title={t("Stop")}
            aria-describedby={shared ? sharedNoteId : undefined}
            aria-disabled={blocked || !canStop}
            disabled={!canStop}
            onClick={() => {
              if (!blocked && canStop) onPlayback(media.name, "stop");
            }}
          >
            <Square className="size-4.5" aria-hidden="true" />
          </Button>
        </div>
        <Slider
          thumbProps={{
            "aria-label": t("Seek {{name}}", { name: media.name }),
            "aria-describedby": [shared && sharedNoteId, showDragTime && dragTimeId].filter(Boolean).join(" ") || undefined,
            "aria-valuetext": t("{{elapsed}} of {{duration}}", { elapsed: time(stopped ? null : cursor), duration: time(displayedDuration) }),
            "aria-disabled": blocked || !available,
            children: showDragTime ? (
              <span
                id={dragTimeId}
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 border border-border bg-popover px-2 py-1 font-mono text-xs whitespace-nowrap text-popover-foreground shadow-md tabular-nums"
              >
                {time(cursor)}
              </span>
            ) : undefined,
          }}
          aria-disabled={blocked || !available}
          disabled={!available}
          min={0}
          max={available ? media.duration! : 1}
          step={1}
          value={[cursor]}
          className="h-5 min-w-0 flex-1 cursor-pointer data-disabled:cursor-default"
          onValueChange={([value]) => {
            if (blocked || !available) return;
            pending.current = value;
            setDraft(pending.current);
          }}
          onPointerDown={(event) => {
            if (blocked || !available) { event.preventDefault(); return; }
            setDragging(true);
          }}
          onKeyDown={(event) => {
            if (blocked || !available) { event.preventDefault(); return; }
            const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 :
              event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
            if (!direction) return;
            event.preventDefault();
            pending.current = Math.max(0, Math.min(media.duration!, (pending.current ?? cursor) + direction * 1000));
            setDraft(pending.current);
          }}
          onPointerUp={commit}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onKeyUp={commit}
          onBlur={commit}
        />
      </div>
      {shared && <p id={sharedNoteId} className="text-xs text-muted-foreground">{t("Shared source: playback controls and seeking also change Program playback.")}</p>}
    </div>
  );
}

export function MediaSeekers() {
  const { t } = useTranslation();
  const { client } = useStudio();
  const contentId = useId();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(collapsedStorageKey) === "true";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(collapsedStorageKey, String(next));
    } catch {
      // Keep the toggle usable when browser storage is unavailable.
    }
  };
  const [media, setMedia] = useState<ActiveMedia[]>([]);
  const [error, setError] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [optimisticCursors, setOptimisticCursors] = useState(() => new Map<string, number>());
  const [optimisticPlayback, setOptimisticPlayback] = useState(() => new Map<string, PendingPlayback>());
  const commandState = useRef({
    playback: new Map<string, PendingPlayback>(),
    pending: new Map<string, { cursor: number; acknowledged: boolean }>(),
    revision: 0,
  });
  const updateOptimisticCursors = () => {
    setOptimisticCursors(new Map([...commandState.current.pending].map(([name, seek]) => [name, seek.cursor])));
  };
  const seek = async (name: string, cursor: number) => {
    const pending = { cursor, acknowledged: false };
    commandState.current.pending.set(name, pending);
    commandState.current.revision++;
    updateOptimisticCursors();
    let applied = false;
    try {
      applied = await client.seekMedia(name, cursor);
    } catch {
      // StudioClient owns request error feedback; restore the last OBS position.
    } finally {
      if (commandState.current.pending.get(name) === pending) {
        if (applied) pending.acknowledged = true;
        else { commandState.current.pending.delete(name); updateOptimisticCursors(); }
      }
    }
  };
  const playback = async (name: string, action: PlaybackAction) => {
    const tracker = commandState.current;
    if (tracker.playback.get(name)?.acknowledged === false) return;
    const pending = {
      state: action === "play" ? "OBS_MEDIA_STATE_PLAYING" : action === "pause" ? "OBS_MEDIA_STATE_PAUSED" : "OBS_MEDIA_STATE_STOPPED",
      acknowledged: false,
    };
    tracker.playback.set(name, pending);
    tracker.revision++;
    setOptimisticPlayback(new Map(tracker.playback));
    let applied = false;
    try {
      applied = await client.setMediaPlayback(name, action);
    } catch {
      // StudioClient owns request feedback; restore the last OBS playback state.
    } finally {
      if (tracker.playback.get(name) === pending) {
        if (applied) pending.acknowledged = true;
        else tracker.playback.delete(name);
        setOptimisticPlayback(new Map(tracker.playback));
      }
    }
  };
  useEffect(() => {
    const tracker = commandState.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (document.visibilityState !== "hidden") {
          const revision = tracker.revision;
          const pending = [...tracker.pending];
          const pendingPlayback = [...tracker.playback];
          const waitingForCommand = [...pending, ...pendingPlayback].some(([, command]) => !command.acknowledged);
          const result = await client.getActiveMedia();
          if (result !== null && !cancelled && revision === tracker.revision && !waitingForCommand) {
            for (const [name, seek] of pending) {
              if (tracker.pending.get(name) === seek) tracker.pending.delete(name);
            }
            for (const [name, command] of pendingPlayback) {
              if (tracker.playback.get(name) === command) tracker.playback.delete(name);
            }
            setOptimisticPlayback(new Map(tracker.playback));
            setOptimisticCursors(new Map([...tracker.pending].map(([name, seek]) => [name, seek.cursor])));
            setMedia(result);
            setError(false);
            setErrorDismissed(false);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) timer = setTimeout(() => void poll(), 1000);
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); tracker.pending.clear(); tracker.playback.clear(); tracker.revision++; };
  }, [client]);
  const controllableMedia = media.filter((source) => !source.live);
  if (!controllableMedia.length && !error) return null;
  return (
    <>
    {error && !errorDismissed && <ErrorNotice message={t("Unable to load active media. Retrying…")} onDismiss={() => setErrorDismissed(true)} />}
    {!!controllableMedia.length && <section aria-label={t("Active media")} className="mt-6 grid gap-3 border border-border bg-card p-4 text-card-foreground">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      {!collapsed && <h3 className="font-heading text-sm font-medium text-preview">{t("Preview")}</h3>}
      <h2 className="col-start-2">
        <Button
          type="button"
          variant="ghost"
          className="justify-center gap-2 bg-transparent px-0 font-heading text-sm hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={toggleCollapsed}
        >
          {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {t("Active media")}
        </Button>
      </h2>
      {!collapsed && <h3 className="justify-self-end font-heading text-sm font-medium text-program">{t("Program")}</h3>}
      </div>
      <div id={contentId} hidden={collapsed} className="grid grid-cols-1 border-t border-border pt-4 min-[901px]:grid-cols-2">
        {!collapsed && (["preview", "program"] as const).map((kind) => {
          const label = kind === "preview" ? t("Preview") : t("Program");
          const sources = controllableMedia.filter((source) => source[kind]);
          return (
            <section key={kind} aria-label={t("{{label}} media", { label })} className="grid min-w-0 content-start border-border min-[901px]:first:pr-4 last:mt-4 last:border-t last:pt-4 min-[901px]:last:mt-0 min-[901px]:last:border-t-0 min-[901px]:last:border-l min-[901px]:last:pt-0 min-[901px]:last:pl-4">
              {sources.length ? sources.map((source) => (
                <MediaSeeker
                  key={source.name}
                  media={{ ...source, state: optimisticPlayback.get(source.name)?.state ?? source.state }}
                  stale={error}
                  playbackPending={optimisticPlayback.get(source.name)?.acknowledged === false}
                  onPlayback={(name, action) => void playback(name, action)}
                  optimisticCursor={optimisticCursors.get(source.name)}
                  onSeek={(name, cursor) => void seek(name, cursor)}
                />
              )) : <p className="text-xs text-muted-foreground">{t("No active media in {{label}}.", { label: label })}</p>}
            </section>
          );
        })}
      </div>
    </section>}
    </>
  );
}
