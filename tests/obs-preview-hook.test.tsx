// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioClient } from "../src/lib/obs";
import { useObsPreview } from "../src/hooks/use-obs-preview";
import { startScreenshotPreview } from "../src/lib/screenshot-preview";
vi.mock("../src/lib/screenshot-preview", () => ({
  startScreenshotPreview: vi.fn(),
  drawScreenshot: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("hides old frames and stops the previous loop on scene, collection, or enabled changes", () => {
  const stop = vi.fn();
  const loops: Parameters<typeof startScreenshotPreview>[0][] = [];
  vi.mocked(startScreenshotPreview).mockImplementation((options) => {
    loops.push(options);
    return stop;
  });
  const client = new StudioClient();
  // The monitor attaches the canvas ref before effects run; supply the same attachment here.
  const { result, rerender } = renderHook(
    ({ scene, enabled, epoch }) => {
      const preview = useObsPreview(client, scene, enabled, epoch);
      preview.canvas.current = document.createElement("canvas");
      return preview;
    },
    { initialProps: { scene: "Camera", enabled: true, epoch: 1 } },
  );
  act(() => loops[0].onPhase("live"));
  expect(result.current.phase).toBe("live");
  rerender({ scene: "Slides", enabled: true, epoch: 1 });
  expect(stop).toHaveBeenCalledOnce();
  expect(result.current.phase).toBe("loading");
  act(() => loops[1].onPhase("live"));
  rerender({ scene: "Slides", enabled: true, epoch: 2 });
  expect(stop).toHaveBeenCalledTimes(2);
  expect(result.current.phase).toBe("loading");
  rerender({ scene: "Slides", enabled: false, epoch: 2 });
  expect(stop).toHaveBeenCalledTimes(3);
  expect(result.current.phase).toBe("idle");
});
