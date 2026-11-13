import { cn } from "../lib/utils";

export function SceneButton({
  name,
  image,
  isPreview,
  isProgram,
  disabled,
  onSelect,
}: {
  name: string;
  image?: string;
  isPreview: boolean;
  isProgram: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      aria-pressed={isPreview}
      aria-label={[name, isPreview && "Preview", isProgram && "Program"]
        .filter(Boolean)
        .join(" ")}
      title={name}
      className={cn(
        "relative aspect-square w-full min-w-0 cursor-pointer overflow-hidden border-2 bg-card text-card-foreground transition-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:cursor-default",
        isProgram
          ? "border-3 border-program"
          : isPreview
            ? "border-3 border-preview"
            : "border-border",
        isPreview &&
          isProgram &&
          "ring-1 ring-preview ring-offset-2 ring-offset-background",
      )}
    >
      {image && (
        <img
          src={image}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {image && <span className="absolute inset-0 bg-black/50" />}
      <span className="absolute inset-0 grid place-items-center px-3 py-10">
        <span
          className={cn(
            "line-clamp-3 text-center text-sm font-medium wrap-anywhere",
            image && "text-white",
          )}
        >
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
