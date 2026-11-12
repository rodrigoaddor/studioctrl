import { cn } from "../lib/utils";

export function SceneButton({
  name,
  isPreview,
  isProgram,
  disabled,
  onSelect,
}: {
  name: string;
  isPreview: boolean;
  isProgram: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={isPreview}
      aria-label={[name, isPreview && "Preview", isProgram && "Program"]
        .filter(Boolean)
        .join(" ")}
      title={name}
      className={cn(
        "relative aspect-square w-full min-w-0 cursor-pointer overflow-hidden border-2 bg-card text-card-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50",
        isProgram
          ? "border-program"
          : isPreview
            ? "border-preview"
            : "border-border",
        isPreview &&
          isProgram &&
          "ring-1 ring-preview ring-offset-2 ring-offset-background",
      )}
    >
      <span className="absolute inset-0 grid place-items-center px-3 py-10">
        <span className="line-clamp-3 text-center text-sm font-medium wrap-anywhere">
          {name}
        </span>
      </span>
      <span className="absolute inset-x-2 bottom-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px]">
        {isPreview && <span className="text-preview">Preview</span>}
        {isProgram && <span className="text-program">Program</span>}
      </span>
    </button>
  );
}
