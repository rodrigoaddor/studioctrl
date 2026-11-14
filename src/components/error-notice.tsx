import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "./ui/button";

export function ErrorNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="fixed top-20 right-6 z-50 flex w-[calc(100%-3rem)] max-w-md items-start gap-3 border border-destructive/40 bg-popover px-3 py-2.5 text-xs text-destructive shadow-md max-[720px]:right-4 max-[720px]:w-[calc(100%-2rem)]"
    >
      <span className="min-w-0 flex-1 py-1 wrap-anywhere">{message}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("Dismiss error")}
        onClick={onDismiss}
      >
        <X />
      </Button>
    </div>
  );
}
