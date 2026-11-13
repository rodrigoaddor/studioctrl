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
  const {
    client,
    profile,
    status,
    studio,
    previewEpoch,
    thumbnails,
    previewReady,
  } = useStudio();
  const [mode, setMode] = useMonitorMode(profile?.id ?? "default", kind);
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
  const hasImage = phase === "live" || !!cached;
  const label = kind === "preview" ? "Preview" : "Program";
  function select(value: string) {
    if (value !== "none" && value !== "obs") return;
    setMode(value);
  }
  return (
    <article
      aria-label={`${label} monitor`}
      className="relative aspect-video w-full min-w-0 overflow-hidden border border-border bg-black text-white"
    >
      {cached && phase !== "live" && (
        <img
          src={cached}
          alt={`Cached preview of ${sceneName}`}
          className="absolute inset-0 size-full object-contain"
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
      {(useCached || phase === "loading" || phase === "error") && (
        <span
          role="status"
          className="absolute inset-x-2 bottom-2 text-center text-[11px] text-white/70"
        >
          {cached
            ? "Cached preview"
            : phase === "loading"
              ? "Loading preview…"
              : "Preview unavailable · Retrying…"}
        </span>
      )}
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
          title={hasImage ? (sceneName ?? undefined) : undefined}
        >
          {hasImage ? sceneName : null}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`${label} settings`}
              className="justify-self-end border-0 text-white shadow-none hover:bg-white/15 hover:text-white focus-visible:bg-white/15 focus-visible:text-white focus-visible:ring-0 aria-expanded:bg-white/15 aria-expanded:text-white dark:hover:bg-white/15"
            >
              <Settings />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup value={mode} onValueChange={select}>
              <DropdownMenuRadioItem value="none">
                No Preview
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="obs">
                OBS Preview
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="remote" disabled>
                Remote Preview
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
