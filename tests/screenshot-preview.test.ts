import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startScreenshotPreview } from "../src/lib/screenshot-preview";
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});
it("paces quick frames at no more than 10 FPS and cleans up on stop", async () => {
  const capture = vi.fn().mockResolvedValue("frame");
  const draw = vi.fn().mockResolvedValue(undefined);
  stop = startScreenshotPreview({ capture, draw, onPhase: vi.fn() });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(capture).toHaveBeenCalledTimes(11);
  expect(draw).toHaveBeenCalledTimes(11);
  stop();
  expect(vi.getTimerCount()).toBe(0);
});
it("waits for OBS and decoding instead of queuing frames, reporting stalled reads", async () => {
  let completeCapture!: (frame: string) => void;
  let completeDraw!: () => void;
  const capture = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        completeCapture = resolve;
      }),
  );
  const draw = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        completeDraw = resolve;
      }),
  );
  const onPhase = vi.fn();
  stop = startScreenshotPreview({ capture, draw, onPhase });
  await vi.advanceTimersByTimeAsync(5_000);
  expect(capture).toHaveBeenCalledOnce();
  expect(onPhase).toHaveBeenLastCalledWith("error");
  completeCapture("frame");
  await vi.advanceTimersByTimeAsync(1_000);
  expect(capture).toHaveBeenCalledOnce();
  expect(draw).toHaveBeenCalledOnce();
  stop();
  completeDraw();
  await vi.advanceTimersByTimeAsync(0);
  expect(onPhase).not.toHaveBeenCalledWith("live");
  expect(vi.getTimerCount()).toBe(0);
});
it("backs off failed captures and recovers without changing controller state", async () => {
  const capture = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue("frame");
  const onPhase = vi.fn();
  stop = startScreenshotPreview({
    capture,
    draw: vi.fn().mockResolvedValue(undefined),
    onPhase,
  });
  await vi.advanceTimersByTimeAsync(999);
  expect(capture).toHaveBeenCalledOnce();
  expect(onPhase).toHaveBeenLastCalledWith("error");
  await vi.advanceTimersByTimeAsync(1);
  expect(capture).toHaveBeenCalledTimes(2);
  expect(onPhase).toHaveBeenLastCalledWith("live");
});
it("pauses captures when hidden and resumes when visible", async () => {
  let visible = false;
  const capture = vi.fn().mockResolvedValue("frame");
  stop = startScreenshotPreview({
    capture,
    draw: vi.fn().mockResolvedValue(undefined),
    onPhase: vi.fn(),
    visible: () => visible,
  });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(capture).not.toHaveBeenCalled();
  visible = true;
  await vi.advanceTimersByTimeAsync(250);
  expect(capture).toHaveBeenCalledOnce();
});
it("discards a capture that completes after its source is stopped", async () => {
  let complete!: (frame: string) => void;
  const draw = vi.fn();
  stop = startScreenshotPreview({
    capture: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    draw,
    onPhase: vi.fn(),
  });
  stop();
  complete("old scene");
  await vi.advanceTimersByTimeAsync(100);
  expect(draw).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
