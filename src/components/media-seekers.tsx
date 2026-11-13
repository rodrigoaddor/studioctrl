import { useEffect, useId, useRef, useState } from "react";
import { useStudio } from "../context";
import type { ActiveMedia } from "../lib/obs";
import { ErrorNotice } from "./error-notice";
import { Pause, Play, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";

function time(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) return "--:--";
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function MediaSeeker({ media, stale, optimisticCursor, onSeek }: {
  media: ActiveMedia;
  stale: boolean;
  optimisticCursor?: number;
  onSeek: (name: string, cursor: number) => void;
}) {
  const { client, busy, syncing } = useStudio();
  const [draft, setDraft] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const pending = useRef<number | null>(null);
  const sharedNoteId = useId();
  const dragTimeId = useId();
  const shared = media.preview && media.program;
  const available = !stale && media.duration !== null && Number.isFinite(media.duration) && media.duration > 0 &&
    ["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED"].includes(media.state);
  const blocked = busy || syncing;
  const showDragTime = dragging && available && !blocked;
  const playing = media.state === "OBS_MEDIA_STATE_PLAYING";
  const canPlayPause = !stale && ["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED", "OBS_MEDIA_STATE_STOPPED", "OBS_MEDIA_STATE_ENDED"].includes(media.state);
  const canStop = !stale && ["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED", "OBS_MEDIA_STATE_OPENING", "OBS_MEDIA_STATE_BUFFERING"].includes(media.state);
  const displayedCursor = draft ?? optimisticCursor ?? media.cursor;
  const cursor = Math.max(0, Math.min(displayedCursor ?? 0, media.duration ?? 0));
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
    <div className="grid min-w-0 gap-2 border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center justify-between gap-4 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium" title={media.name}>{media.name}</span>
          {media.preview && <span className="shrink-0 text-preview">Preview</span>}
          {media.program && <span className="shrink-0 text-program">Program</span>}
        </div>
        <span className="shrink-0 font-mono text-muted-foreground tabular-nums">{time(displayedCursor)} / {time(media.duration)}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 gap-1">
          <Button
            variant="outline"
            size="sm"
            className="w-20"
            aria-label={`${playing ? "Pause" : "Play"} ${media.name}`}
            aria-describedby={shared ? sharedNoteId : undefined}
            aria-disabled={blocked || !canPlayPause}
            disabled={!canPlayPause}
            onClick={() => {
              if (!blocked && canPlayPause) void client.setMediaPlayback(media.name, playing ? "pause" : "play");
            }}
          >
            {playing ? <Pause /> : <Play />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Stop ${media.name}`}
            aria-describedby={shared ? sharedNoteId : undefined}
            aria-disabled={blocked || !canStop}
            disabled={!canStop}
            onClick={() => {
              if (!blocked && canStop) void client.setMediaPlayback(media.name, "stop");
            }}
          >
            <Square /> Stop
          </Button>
        </div>
        <Slider
          thumbProps={{
            "aria-label": `Seek ${media.name}`,
            "aria-describedby": [shared && sharedNoteId, showDragTime && dragTimeId].filter(Boolean).join(" ") || undefined,
            "aria-valuetext": `${time(cursor)} of ${time(media.duration)}`,
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
      {shared && <p id={sharedNoteId} className="text-xs text-muted-foreground">Shared source: playback controls and seeking also change Program playback.</p>}
    </div>
  );
}

export function MediaSeekers() {
  const { client } = useStudio();
  const [media, setMedia] = useState<ActiveMedia[]>([]);
  const [error, setError] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [optimisticCursors, setOptimisticCursors] = useState(() => new Map<string, number>());
  const seekState = useRef({
    pending: new Map<string, { cursor: number; acknowledged: boolean }>(),
    revision: 0,
  });
  const updateOptimisticCursors = () => {
    setOptimisticCursors(new Map([...seekState.current.pending].map(([name, seek]) => [name, seek.cursor])));
  };
  const seek = async (name: string, cursor: number) => {
    const pending = { cursor, acknowledged: false };
    seekState.current.pending.set(name, pending);
    seekState.current.revision++;
    updateOptimisticCursors();
    let applied = false;
    try {
      applied = await client.seekMedia(name, cursor);
    } catch {
      // StudioClient owns request error feedback; restore the last OBS position.
    } finally {
      if (seekState.current.pending.get(name) === pending) {
        if (applied) pending.acknowledged = true;
        else { seekState.current.pending.delete(name); updateOptimisticCursors(); }
      }
    }
  };
  useEffect(() => {
    const tracker = seekState.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (document.visibilityState !== "hidden") {
          const revision = tracker.revision;
          const pending = [...tracker.pending];
          const waitingForCommand = pending.some(([, seek]) => !seek.acknowledged);
          const result = await client.getActiveMedia();
          if (!cancelled && revision === tracker.revision && !waitingForCommand) {
            for (const [name, seek] of pending) {
              if (tracker.pending.get(name) === seek) tracker.pending.delete(name);
            }
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
    return () => { cancelled = true; clearTimeout(timer); tracker.pending.clear(); tracker.revision++; };
  }, [client]);
  if (!media.length && !error) return null;
  return (
    <>
    {error && !errorDismissed && <ErrorNotice message="Unable to load active media. Retrying…" onDismiss={() => setErrorDismissed(true)} />}
    {!!media.length && <section aria-label="Active media" className="mt-6 grid gap-3">
      <h2 className="font-heading text-sm font-medium">Active media</h2>
      <div className="grid grid-cols-1 items-start gap-6 min-[901px]:grid-cols-2">
        {(["preview", "program"] as const).map((kind) => {
          const label = kind === "preview" ? "Preview" : "Program";
          const sources = media.filter((source) => source[kind]);
          return (
            <section key={kind} aria-label={`${label} media`} className="grid min-w-0 gap-3">
              <h3 className={`font-heading text-sm font-medium ${kind === "preview" ? "text-preview" : "text-program"}`}>{label}</h3>
              {sources.length ? sources.map((source) => (
                <MediaSeeker key={source.name} media={source} stale={error} optimisticCursor={optimisticCursors.get(source.name)} onSeek={(name, cursor) => void seek(name, cursor)} />
              )) : <p className="text-xs text-muted-foreground">No active media in {label}.</p>}
            </section>
          );
        })}
      </div>
    </section>}
    </>
  );
}
