import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useStudio } from "../context";
import { TransitionDuration } from "./transition-duration";
import { PreviewToggle } from "./preview-toggle";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function TransitionControl() {
  const {
    client,
    transitions,
    currentTransition,
    duration,
    preview,
    busy,
    syncing,
  } = useStudio();
  const disabled = busy || syncing;
  const [menuOpen, setMenuOpen] = useState(false);
  const unavailable =
    !preview || !currentTransition || !transitions.includes(currentTransition);
  return (
    <section
      aria-label="Transitions"
      className="mx-auto grid h-full w-40 min-w-0 grid-rows-[auto_auto_auto] content-center gap-6 max-[900px]:h-auto max-[900px]:w-full sm:max-[900px]:grid-cols-3 sm:max-[900px]:grid-rows-1 max-sm:max-w-sm max-sm:grid-cols-2 max-sm:grid-rows-[auto_auto] max-[900px]:items-center max-[900px]:gap-3 max-[720px]:gap-2"
    >
      <div className="max-sm:col-start-1 max-sm:row-start-2 max-[900px]:w-full sm:max-[900px]:max-w-40 max-[900px]:self-center max-[900px]:[&>button]:h-auto max-[900px]:[&>button]:min-h-8 max-[900px]:[&>button]:px-1.5 max-[900px]:[&>button]:py-1 max-[900px]:[&>button]:whitespace-normal">
        <PreviewToggle />
      </div>
      <Button
        className="h-14 w-full text-sm max-sm:col-span-2 max-sm:row-start-1 sm:max-[900px]:max-w-40 max-[900px]:justify-self-center max-[900px]:gap-1 max-[900px]:px-1.5"
        disabled={unavailable}
        aria-disabled={disabled || unavailable}
        title={
          currentTransition
            ? `Transition Preview to Program using ${currentTransition}`
            : "No transition selected"
        }
        onClick={() => {
          if (!disabled && currentTransition)
            void client.transition(currentTransition);
        }}
      >
        Transition <ArrowRight />
      </Button>
      <div className="relative flex w-full min-w-0 flex-col gap-2 max-sm:col-start-2 max-sm:row-start-2 sm:max-[900px]:max-w-40 max-[900px]:self-center max-[900px]:justify-self-end">
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(open) => {
            if (!open || !disabled) setMenuOpen(open);
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between"
              aria-label="Select transition"
              disabled={!transitions.length}
              aria-disabled={disabled || !transitions.length}
            >
              <span className="truncate">
                {currentTransition ?? "No transition"}
              </span>
              {duration !== null && (
                <span className="shrink-0 text-[11px] text-muted-foreground max-[600px]:hidden">
                  {duration} ms
                </span>
              )}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-0">
            <DropdownMenuRadioGroup
              value={currentTransition ?? ""}
              onValueChange={(name) => {
                if (!disabled) void client.selectTransition(name);
              }}
            >
              {transitions.map((name) => (
                <DropdownMenuRadioItem
                  key={name}
                  value={name}
                  disabled={disabled}
                  className="wrap-anywhere"
                >
                  {name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {duration !== null && (
              <>
                <DropdownMenuSeparator />
                <div
                  onKeyDown={(event) => {
                    // Keep editing keys out of the menu's navigation and typeahead.
                    if (event.key !== "Escape") event.stopPropagation();
                  }}
                >
                  <TransitionDuration
                    duration={duration}
                    transitionName={currentTransition}
                    disabled={!currentTransition || !transitions.length}
                    readOnly={disabled}
                    onChange={(value) => void client.setTransitionDuration(value)}
                  />
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {!transitions.length && (
          <span className="absolute inset-x-0 top-full mt-1 text-center text-[11px] text-muted-foreground">
            No transitions configured
          </span>
        )}
      </div>
    </section>
  );
}
