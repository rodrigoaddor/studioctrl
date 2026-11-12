import { cn } from "../lib/utils";

export function SceneMonitor({
  kind,
  sceneName,
}: {
  kind: "preview" | "program";
  sceneName: string | null;
}) {
  const label = kind === "preview" ? "Preview" : "Program";
  return (
    <article
      aria-label={`${label} monitor`}
      className="relative aspect-video w-full min-w-0 overflow-hidden border border-border bg-black text-white"
    >
      <div className="absolute inset-0 grid place-items-center px-6 py-12">
        <h2
          className="line-clamp-3 text-center text-xl font-medium wrap-anywhere max-[720px]:text-base"
          title={sceneName ?? undefined}
        >
          {sceneName ?? `No ${kind} scene`}
        </h2>
      </div>
      <div className="absolute inset-x-0 top-0 flex h-9 items-center justify-end gap-1.5 bg-black/60 px-3 text-xs">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            kind === "preview" ? "bg-preview" : "bg-program",
          )}
        />
        {label}
      </div>
    </article>
  );
}
