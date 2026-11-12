// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { drawScreenshot } from "../src/lib/screenshot-preview";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("decodes the next frame before replacing the canvas and ignores obsolete decodes", async () => {
  let complete!: () => void;
  class Frame {
    src = "";
    decoding = "";
    naturalWidth = 640;
    naturalHeight = 360;
    decode = () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      });
  }
  vi.stubGlobal("Image", Frame);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const canvas = document.createElement("canvas");
  const drawImage = vi.fn();
  vi.spyOn(canvas, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const controller = new AbortController();
  const pending = drawScreenshot(
    canvas,
    "data:image/jpeg;base64,frame",
    controller.signal,
  );
  expect(drawImage).not.toHaveBeenCalled();
  complete();
  await pending;
  expect(drawImage).toHaveBeenCalledOnce();
  expect(canvas.width).toBe(640);
  expect(canvas.height).toBe(360);
  const outdated = drawScreenshot(
    canvas,
    "data:image/jpeg;base64,old",
    controller.signal,
  );
  controller.abort();
  complete();
  await outdated;
  expect(drawImage).toHaveBeenCalledOnce();
});
