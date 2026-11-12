import { ArrowRight, ChevronDown, LoaderCircle } from "lucide-react";
import { useStudio } from "../context";
import { Button } from "./ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "./ui/button-group";
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
  return (
    <section
      aria-label="Transitions"
      className="flex min-w-0 flex-col items-center gap-2"
    >
      <DropdownMenu>
        <ButtonGroup aria-label="Transition controls">
          <Button
            className="min-w-24 max-w-40"
            disabled={
              disabled ||
              !preview ||
              !currentTransition ||
              !transitions.includes(currentTransition)
            }
            aria-label={
              currentTransition
                ? `Transition with ${currentTransition}`
                : "No transition selected"
            }
            title="Transition Preview to Program"
            onClick={() => {
              if (currentTransition) void client.transition(currentTransition);
            }}
          >
            <span className="truncate">
              {currentTransition ?? "No transition"}
            </span>
            <ArrowRight />
          </Button>
          <ButtonGroupSeparator className="bg-primary-foreground/20" />
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              aria-label="Select transition"
              disabled={disabled || !transitions.length}
            >
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
        </ButtonGroup>
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
      <span className="text-[11px] text-muted-foreground">
        {!transitions.length
          ? "No transitions configured"
          : duration === null
            ? "Fixed duration"
            : `${duration} ms`}
      </span>
      {busy && (
        <span
          role="status"
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <LoaderCircle className="size-3 animate-spin" /> Updating OBS…
        </span>
      )}
    </section>
  );
}
