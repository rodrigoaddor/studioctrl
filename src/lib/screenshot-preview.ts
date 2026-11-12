export type PreviewPhase = "loading" | "live" | "error";

// A sequential loop: never queue frames faster than OBS and the decoder can deliver.
export function startScreenshotPreview({
  capture,
  draw,
  onPhase,
  visible = () => true,
}: {
  capture: () => Promise<string>;
  draw: (data: string, signal: AbortSignal) => Promise<void>;
  onPhase: (phase: PreviewPhase) => void;
  visible?: () => boolean;
}) {
  const controller = new AbortController();
  const { signal } = controller;
  let timer: ReturnType<typeof setTimeout>;
  let slowTimer: ReturnType<typeof setTimeout>;
  let failures = 0;
  onPhase("loading");
  async function next() {
    if (signal.aborted) return;
    if (!visible()) {
      timer = setTimeout(() => void next(), 250);
      return;
    }
    const started = performance.now();
    let delay = 100;
    // Report a stalled frame, but keep waiting instead of issuing more requests.
    slowTimer = setTimeout(() => {
      if (!signal.aborted) onPhase("error");
    }, 3_000);
    try {
      const data = await capture();
      if (signal.aborted) return;
      if (visible()) {
        await draw(data, signal);
        if (signal.aborted) return;
        onPhase("live");
      }
      failures = 0;
      delay = Math.max(0, 100 - (performance.now() - started));
    } catch {
      if (signal.aborted) return;
      onPhase("error");
      delay = Math.min(5_000, 1_000 * 2 ** Math.min(failures++, 3));
    } finally {
      clearTimeout(slowTimer);
    }
    if (!signal.aborted) timer = setTimeout(() => void next(), delay);
  }
  void next();
  return () => {
    controller.abort();
    clearTimeout(timer);
    clearTimeout(slowTimer);
  };
}

export async function drawScreenshot(
  canvas: HTMLCanvasElement,
  data: string,
  signal: AbortSignal,
) {
  const image = new Image();
  image.decoding = "async";
  const abort = () => {
    image.src = "";
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) return;
    image.src = data;
    await image.decode();
    if (signal.aborted || document.hidden) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas unavailable");
    if (
      canvas.width !== image.naturalWidth ||
      canvas.height !== image.naturalHeight
    ) {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
    }
    context.drawImage(image, 0, 0);
  } finally {
    signal.removeEventListener("abort", abort);
    image.src = "";
  }
}
