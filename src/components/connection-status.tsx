import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { isObsOnline } from "../lib/reachability";
import { cn } from "../lib/utils";

export function ConnectionStatus({ url, name }: { url: string; name: string }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ url: string; online: boolean } | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      const online = await isObsOnline(url, controller.signal);
      if (controller.signal.aborted) return;
      setResult({ url, online });
      timer = setTimeout(() => void check(), 15_000);
    }
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [url]);
  const online = result?.url === url ? result.online : null;
  const label = online === null ? t("Checking…") : online ? t("Online") : t("Offline");
  return (
    <span
      role="status"
      aria-label={`${name}: ${label}`}
      title={t("OBS WebSocket reachability; authentication is checked when connecting.")}
      className={cn(
        "inline-flex h-5 w-24 shrink-0 items-center justify-center gap-1.5 border px-1.5 py-0.5 text-[10px]",
        online === null
          ? "border-border text-muted-foreground"
          : online
            ? "border-preview/30 bg-preview/10 text-preview"
            : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
