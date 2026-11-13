export { cn } from "cn";

export function formatOutputDuration(duration: number) {
  const seconds = Math.floor(Math.max(0, Number.isFinite(duration) ? duration : 0) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
