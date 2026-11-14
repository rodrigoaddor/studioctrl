import { useTranslation } from "react-i18next";
import { useLayoutEffect, useState } from "react";
import { Clock } from "lucide-react";
import { MAX_TRANSITION_DURATION, MIN_TRANSITION_DURATION } from "../lib/obs";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";

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
  const { t } = useTranslation();
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
    <div className="flex w-full flex-col">
      <InputGroup className="border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:bg-accent has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot][aria-invalid=true]]:ring-0 dark:bg-transparent dark:has-[[data-slot][aria-invalid=true]]:ring-0">
        <InputGroupAddon aria-hidden="true">
          <Clock />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={t("Transition duration (milliseconds)")}
          type="number"
          min={MIN_TRANSITION_DURATION}
          max={MAX_TRANSITION_DURATION}
          step={1}
          required={duration !== null}
          value={draft}
          disabled={disabled || duration === null}
          readOnly={readOnly}
          aria-disabled={disabled || readOnly || duration === null}
          placeholder={duration === null ? t("Fixed") : undefined}
          title={t("50–20,000 ms. Press Enter or leave the field to apply.")}
          aria-invalid={invalid}
          className="text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
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
        <InputGroupAddon align="inline-end" aria-hidden="true">
          <InputGroupText>ms</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {invalid && (
        <span
          role="alert"
          className="px-2 pb-2 text-[10px] text-destructive"
        >{t("Enter 50–20,000 ms.")}</span>
      )}
    </div>
  );
}
