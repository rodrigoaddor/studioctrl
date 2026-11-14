import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "../lib/utils";

export function PasswordInput({
  id,
  className,
  secretLabel = "password",
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & { secretLabel?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const action = `${visible ? "Hide" : "Show"} ${secretLabel}`;
  return (
    <span className="relative block min-w-0">
      <Input
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0 text-muted-foreground"
        aria-label={action}
        aria-controls={inputId}
        title={action}
        disabled={props.disabled}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </span>
  );
}
