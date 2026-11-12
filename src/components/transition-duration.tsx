import { useLayoutEffect, useState } from "react";
import { MAX_TRANSITION_DURATION, MIN_TRANSITION_DURATION } from "../lib/obs";
import { Input } from "./ui/input";

export function TransitionDuration({
  duration,
  transitionName,
  disabled,
  readOnly = false,
  onChange,
}: {
  duration: number | null;
  transitionName: string | null;
  disabled: boolean;
  readOnly?: boolean;
  onChange: (duration: number) => void;
}) {
  const [draft, setDraft] = useState(duration?.toString() ?? "");
  const [invalid, setInvalid] = useState(false);
  useLayoutEffect(() => {
    setDraft(duration?.toString() ?? "");
    setInvalid(false);
  }, [duration, transitionName]);
  function commit(input: HTMLInputElement) {
    if (disabled || readOnly || duration === null) return;
    if (!input.validity.valid) {
      setInvalid(true);
      return;
    }
    const next = input.valueAsNumber;
    setInvalid(false);
    if (next !== duration) onChange(next);
  }
  return (
    <div className="relative flex w-full flex-col gap-1">
      <label className="relative block w-full">
        <span className="sr-only">Transition duration (milliseconds)</span>
        <Input
          type="number"
          min={MIN_TRANSITION_DURATION}
          max={MAX_TRANSITION_DURATION}
          step={1}
          required={duration !== null}
          value={draft}
          disabled={disabled || duration === null}
          readOnly={readOnly}
          aria-disabled={disabled || readOnly || duration === null}
          placeholder={duration === null ? "Fixed" : undefined}
          title="50–20,000 ms. Press Enter or leave the field to apply."
          aria-invalid={invalid}
          className="pr-8 text-center tabular-nums"
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={(event) => commit(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        {duration !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-muted-foreground"
          >
            ms
          </span>
        )}
      </label>
      {invalid && (
        <span
          role="alert"
          className="absolute inset-x-0 top-full mt-1 text-[10px] text-destructive"
        >
          Enter 50–20,000 ms.
        </span>
      )}
    </div>
  );
}
