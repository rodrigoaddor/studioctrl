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
      className="mx-auto grid h-full w-40 min-w-0 grid-rows-[1fr_auto_1fr] gap-2 max-[900px]:h-auto max-[900px]:grid-rows-none max-[900px]:gap-3"
    >
      <div className="self-start">
        <PreviewToggle />
      </div>
      <Button
        className="w-full"
        size="lg"
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
      <div className="relative flex w-full flex-col gap-2 self-end">
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
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56">
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
          </DropdownMenuContent>
        </DropdownMenu>
        <TransitionDuration
          duration={duration}
          transitionName={currentTransition}
          disabled={!currentTransition || !transitions.length}
          readOnly={disabled}
          onChange={(value) => void client.setTransitionDuration(value)}
        />
        {!transitions.length && (
          <span className="absolute inset-x-0 top-full mt-1 text-center text-[11px] text-muted-foreground">
            No transitions configured
          </span>
        )}
      </div>
    </section>
  );
}
