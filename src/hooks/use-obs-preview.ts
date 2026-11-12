import { useEffect, useRef, useState } from "react";
import type { StudioClient } from "../lib/obs";
import {
  drawScreenshot,
  startScreenshotPreview,
  type PreviewPhase,
} from "../lib/screenshot-preview";

export function useObsPreview(
  client: StudioClient,
  sceneName: string | null,
  enabled: boolean,
  epoch: number,
) {
  const source = sceneName ? `${epoch}:${sceneName}` : null;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<{
    source: string | null;
    phase: PreviewPhase | "idle";
  }>({ source: null, phase: "idle" });
  useEffect(() => {
    if (!enabled || !sceneName || !canvas.current) {
      setState({ source, phase: "idle" });
      return;
    }
    const target = canvas.current;
    return startScreenshotPreview({
      capture: () => client.getScreenshot(sceneName),
      draw: (data, signal) => drawScreenshot(target, data, signal),
      onPhase: (phase) =>
        setState((previous) =>
          previous.source === source && previous.phase === phase
            ? previous
            : { source, phase },
        ),
      visible: () => !document.hidden,
    });
  }, [client, sceneName, enabled, source]);
  const phase =
    !enabled || !sceneName
      ? "idle"
      : state.source === source
        ? state.phase
        : "loading";
  return { canvas, phase };
}
