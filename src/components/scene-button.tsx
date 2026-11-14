import { useRef } from "react";
import { ContextMenu } from "radix-ui";
import { Eye, EyeOff, Image, ImageOff, Video } from "lucide-react";
import { cn } from "../lib/utils";

export function SceneButton({
  name,
  image,
  hasMedia = false,
  hasImage = false,
  isPreview,
  isProgram,
  disabled,
  onSelect,
  hidden = false,
  onGenerate,
  onReset,
  onToggleHidden,
}: {
  name: string;
  image?: string;
  hasMedia?: boolean;
  hasImage?: boolean;
  isPreview: boolean;
  isProgram: boolean;
  disabled: boolean;
  onSelect: () => void;
  hidden?: boolean;
  onGenerate: () => void;
  onReset: () => void;
  onToggleHidden: () => void;
}) {
  const contextGesture = useRef(false);
  return (
    <ContextMenu.Root
      modal={false}
      onOpenChange={(open) => {
        if (open) contextGesture.current = true;
      }}
    >
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          aria-disabled={disabled}
          onPointerDownCapture={() => {
            contextGesture.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              contextGesture.current = false;
          }}
          onClick={() => {
            if (!disabled && !contextGesture.current) onSelect();
          }}
          aria-pressed={isPreview}
          aria-label={[
            name,
            isPreview && "Preview",
            isProgram && "Program",
            hidden && "Hidden",
          ]
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
              draggable={false}
              className="absolute inset-0 size-full object-cover"
            />
          )}
          {image && <span className="absolute inset-0 bg-black/50" />}
          {hidden && (
            <EyeOff
              aria-label="Hidden scene"
              className="absolute top-2 left-2 size-4 text-white drop-shadow-md"
            />
          )}
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
          <span className="absolute inset-x-2 top-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px]">
            {isPreview && <span className="text-preview-label">Preview</span>}
            {isProgram && <span className="text-program-label">Program</span>}
          </span>
          {hasMedia && (
            <Video
              aria-label="Contains media source"
              className={cn("absolute right-2 bottom-2 size-4", hasImage && "right-7", image && "text-white drop-shadow-md")}
            />
          )}
          {hasImage && (
            <Image
              aria-label="Contains image source"
              className={cn("absolute right-2 bottom-2 size-4", image && "text-white drop-shadow-md")}
            />
          )}
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-44 rounded-none bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <ContextMenu.Item
            disabled={disabled}
            onSelect={onGenerate}
            className="flex cursor-default items-center gap-2 px-2 py-2 text-xs outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
          >
            <Image className="size-4" /> Generate preview
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={disabled}
            onSelect={onReset}
            className="flex cursor-default items-center gap-2 px-2 py-2 text-xs outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
          >
            <ImageOff className="size-4" /> Reset preview
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item
            onSelect={onToggleHidden}
            className="flex cursor-default items-center gap-2 px-2 py-2 text-xs outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
          >
            {hidden ? (
              <Eye className="size-4" />
            ) : (
              <EyeOff className="size-4" />
            )}
            {hidden ? "Show scene" : "Hide scene"}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
