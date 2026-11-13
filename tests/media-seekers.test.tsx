// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MediaSeekers } from "../src/components/media-seekers";
import { useStudio } from "../src/context";
import { StudioClient, type ActiveMedia } from "../src/lib/obs";

vi.mock("../src/context", () => ({ useStudio: vi.fn() }));
const client = new StudioClient();
const clip: ActiveMedia = { name: "Clip", preview: false, program: true, state: "OBS_MEDIA_STATE_PLAYING", duration: 60000, cursor: 5000 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    constructor(type: string, options: PointerEventInit = {}) {
      super(type, options);
      this.pointerId = options.pointerId ?? 1;
    }
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  vi.mocked(useStudio).mockReturnValue({ client, ...client.getSnapshot() });
  vi.spyOn(client, "getActiveMedia").mockResolvedValue([clip]);
  vi.spyOn(client, "seekMedia").mockResolvedValue(true);
  vi.spyOn(client, "setMediaPlayback").mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = async () => {
  const result = render(<MediaSeekers />);
  await act(async () => {});
  return result;
};

function scrub(slider: HTMLElement, value: number) {
  const root = slider.closest<HTMLElement>('[data-slot="slider"]')!;
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, right: 600, bottom: 20, width: 600, height: 20, x: 0, y: 0, toJSON() {},
  });
  const duration = Number(slider.getAttribute("aria-valuemax"));
  fireEvent.pointerDown(root, { clientX: value / duration * 600, button: 0, pointerId: 1 });
}

it("shows playback time, preserves scrubbing during polling, and sends one seek on release", async () => {
  await mount();
  expect(screen.getByText("0:05 / 1:00")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Preview media" })).queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.getByText("No active media in Preview.")).toBeInTheDocument();
  const slider = screen.getByRole("slider", { name: "Seek Clip" });
  scrub(slider, 20000);
  expect(client.seekMedia).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(slider).toHaveAttribute("aria-valuenow", "20000");
  fireEvent.pointerUp(slider);
  expect(slider).toHaveAttribute("aria-valuenow", "20000");
  expect(screen.getByText("0:20 / 1:00")).toBeInTheDocument();
  fireEvent.blur(slider);
  expect(client.seekMedia).toHaveBeenCalledExactlyOnceWith("Clip", 20000);
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...clip, cursor: 21000 }]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(slider).toHaveAttribute("aria-valuenow", "21000");
  expect(screen.getByText("0:21 / 1:00")).toBeInTheDocument();
});

it("shares optimistic seeks and ignores reads started before the seek was acknowledged", async () => {
  const shared = { ...clip, preview: true };
  vi.mocked(client.getActiveMedia).mockResolvedValue([shared]);
  let finishSeek!: (applied: boolean) => void;
  vi.mocked(client.seekMedia).mockReturnValue(new Promise((resolve) => { finishSeek = resolve; }));
  await mount();
  let finishOldRead!: (media: ActiveMedia[]) => void;
  vi.mocked(client.getActiveMedia).mockReturnValueOnce(new Promise((resolve) => { finishOldRead = resolve; }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  const sliders = screen.getAllByRole("slider");
  scrub(sliders[0], 20000);
  fireEvent.pointerUp(sliders[0]);
  for (const slider of sliders) expect(slider).toHaveAttribute("aria-valuenow", "20000");
  await act(async () => { finishOldRead([shared]); });
  for (const slider of sliders) expect(slider).toHaveAttribute("aria-valuenow", "20000");
  // Even a completed read during the pending command must not clear optimism.
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  for (const slider of sliders) expect(slider).toHaveAttribute("aria-valuenow", "20000");
  await act(async () => { finishSeek(true); });
  for (const slider of sliders) expect(slider).toHaveAttribute("aria-valuenow", "20000");
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...shared, cursor: 21000 }]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  for (const slider of sliders) expect(slider).toHaveAttribute("aria-valuenow", "21000");
});

it("rolls back an unsuccessful seek and lets newer seeks replace older optimistic positions", async () => {
  await mount();
  const slider = screen.getByRole("slider");
  const finishSeeks: ((applied: boolean) => void)[] = [];
  vi.mocked(client.seekMedia).mockImplementation(() => new Promise((resolve) => { finishSeeks.push(resolve); }));
  for (const value of [20000, 30000]) {
    scrub(slider, value);
    fireEvent.pointerUp(slider);
  }
  await act(async () => { finishSeeks[0](false); });
  expect(slider).toHaveAttribute("aria-valuenow", "30000");
  await act(async () => { finishSeeks[1](false); });
  expect(slider).toHaveAttribute("aria-valuenow", "5000");
  expect(screen.getByText("0:05 / 1:00")).toBeInTheDocument();
});

it("supports keyboard seeking and blocks temporary busy actions", async () => {
  const { rerender } = await mount();
  const slider = screen.getByRole("slider");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(slider).toHaveAttribute("aria-valuenow", "6000");
  expect(client.seekMedia).not.toHaveBeenCalled();
  fireEvent.keyUp(slider, { key: "ArrowRight" });
  expect(client.seekMedia).toHaveBeenCalledExactlyOnceWith("Clip", 6000);
  vi.mocked(useStudio).mockReturnValue({ client, ...client.getSnapshot(), busy: true });
  rerender(<MediaSeekers />);
  expect(slider).toHaveAttribute("aria-disabled", "true");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  fireEvent.keyUp(slider, { key: "ArrowRight" });
  scrub(slider, 8000);
  fireEvent.pointerUp(slider);
  expect(client.seekMedia).toHaveBeenCalledTimes(1);
});

it("uses one-second backward steps and Radix Home/End navigation", async () => {
  await mount();
  const slider = screen.getByRole("slider");
  for (const [key, expected] of [["ArrowLeft", 4000], ["Home", 0], ["End", 60000]] as const) {
    fireEvent.keyDown(slider, { key });
    expect(slider).toHaveAttribute("aria-valuenow", String(expected));
    fireEvent.keyUp(slider, { key });
    expect(client.seekMedia).toHaveBeenLastCalledWith("Clip", expected);
  }
});

it.each([
  ["ArrowRight", 5123, 6123],
  ["ArrowUp", 5123, 6123],
  ["ArrowLeft", 5123, 4123],
  ["ArrowDown", 5123, 4123],
  ["ArrowRight", 59923, 60000],
  ["ArrowLeft", 123, 0],
])("moves %s from %i to %i without rounding to whole seconds", async (key, cursor, expected) => {
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...clip, cursor }]);
  await mount();
  const slider = screen.getByRole("slider");
  fireEvent.keyDown(slider, { key });
  expect(slider).toHaveAttribute("aria-valuenow", String(expected));
  expect(client.seekMedia).not.toHaveBeenCalled();
  fireEvent.keyUp(slider, { key });
  expect(client.seekMedia).toHaveBeenCalledExactlyOnceWith("Clip", expected);
});

it("preserves millisecond positions during scrubbing and OBS synchronization", async () => {
  await mount();
  const slider = screen.getByRole("slider");
  scrub(slider, 21234);
  expect(slider).toHaveAttribute("aria-valuenow", "21234");
  fireEvent.pointerUp(slider);
  expect(client.seekMedia).toHaveBeenCalledExactlyOnceWith("Clip", 21234);
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...clip, cursor: 21357 }]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(slider).toHaveAttribute("aria-valuenow", "21357");
});

it.each([16000, 17000, 18000])("keeps a seek to %ims near the end of an 18-second clip", async (target) => {
  const shortClip = { ...clip, duration: 18000, cursor: 15000 };
  vi.mocked(client.getActiveMedia).mockResolvedValue([shortClip]);
  await mount();
  const slider = screen.getByRole("slider");
  scrub(slider, target);
  fireEvent.pointerUp(slider);
  expect(client.seekMedia).toHaveBeenCalledExactlyOnceWith("Clip", target);
  expect(slider).toHaveAttribute("aria-valuenow", String(target));
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...shortClip, cursor: target }]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(slider).toHaveAttribute("aria-valuenow", String(target));
});

it("reconciles optimistic seeking with OBS's actual keyframe-aligned cursor", async () => {
  const source = { ...clip, duration: 18668, cursor: 15041, state: "OBS_MEDIA_STATE_PAUSED" };
  vi.mocked(client.getActiveMedia).mockResolvedValue([source]);
  await mount();
  const slider = screen.getByRole("slider");
  scrub(slider, 17000);
  fireEvent.pointerUp(slider);
  expect(client.seekMedia).toHaveBeenCalledExactlyOnceWith("Clip", 17000);
  expect(slider).toHaveAttribute("aria-valuenow", "17000");
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(slider).toHaveAttribute("aria-valuenow", "15041");
  expect(screen.getByText("0:15 / 0:18")).toBeInTheDocument();
});

it("discards cancelled pointer scrubbing without seeking", async () => {
  await mount();
  const slider = screen.getByRole("slider");
  scrub(slider, 20000);
  expect(slider).toHaveAttribute("aria-valuenow", "20000");
  fireEvent.pointerCancel(slider);
  fireEvent.blur(slider);
  expect(slider).toHaveAttribute("aria-valuenow", "5000");
  expect(client.seekMedia).not.toHaveBeenCalled();
});

it("shows the live scrub time above the thumb only during pointer dragging", async () => {
  await mount();
  const slider = screen.getByRole("slider");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  scrub(slider, 20000);
  expect(screen.getByRole("tooltip")).toHaveTextContent("0:20");
  expect(slider).toHaveAccessibleDescription("0:20");
  const root = slider.closest<HTMLElement>('[data-slot="slider"]')!;
  fireEvent.pointerMove(root, { clientX: 240, pointerId: 1 });
  expect(screen.getByRole("tooltip")).toHaveTextContent("0:24");
  fireEvent.pointerUp(root, { pointerId: 1 });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(client.seekMedia).toHaveBeenCalledExactlyOnceWith("Clip", 24000);
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("hides drag time on cancellation, blur, or lost capture and blocks unavailable tooltips", async () => {
  const { rerender } = await mount();
  const slider = screen.getByRole("slider");
  for (const finish of [fireEvent.pointerCancel, fireEvent.blur, fireEvent.lostPointerCapture]) {
    scrub(slider, 20000);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    finish(slider);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  }
  vi.mocked(useStudio).mockReturnValue({ client, ...client.getSnapshot(), busy: true });
  rerender(<MediaSeekers />);
  scrub(slider, 30000);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("disables unknown-duration media and removes sources when inactive", async () => {
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...clip, duration: null, cursor: null }]);
  await mount();
  expect(screen.getByRole("slider")).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByText("--:-- / --:--")).toBeInTheDocument();
  vi.mocked(client.getActiveMedia).mockResolvedValue([]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.queryByRole("region", { name: "Active media" })).not.toBeInTheDocument();
});

it("serializes polling and discards late results after unmount", async () => {
  let resolve!: (media: ActiveMedia[]) => void;
  vi.mocked(client.getActiveMedia).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { unmount } = render(<MediaSeekers />);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(client.getActiveMedia).toHaveBeenCalledTimes(1);
  unmount();
  await act(async () => { resolve([clip]); });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(client.getActiveMedia).toHaveBeenCalledTimes(1);
});

it("preserves rows through polling errors and recovers without enabling stale controls on dismissal", async () => {
  await mount();
  const slider = screen.getByRole("slider");
  vi.mocked(client.getActiveMedia).mockRejectedValue(new Error("Unavailable"));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole("slider")).toBe(slider);
  expect(slider).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load active media");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
  expect(slider).toHaveAttribute("aria-disabled", "true");
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...clip, cursor: 10000 }]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(slider).toHaveAttribute("aria-disabled", "false");
  expect(slider).toHaveAttribute("aria-valuenow", "10000");
});

it("groups Preview and Program media separately and shows shared sources in both sections", async () => {
  vi.mocked(client.getActiveMedia).mockResolvedValue([
    { ...clip, name: "Preview clip", preview: true, program: false },
    { ...clip, name: "Program clip" },
    { ...clip, name: "Shared clip", preview: true },
  ]);
  await mount();
  const preview = within(screen.getByRole("region", { name: "Preview media" }));
  const program = within(screen.getByRole("region", { name: "Program media" }));
  expect(preview.getAllByRole("slider")).toHaveLength(2);
  expect(program.getAllByRole("slider")).toHaveLength(2);
  expect(preview.queryByRole("slider", { name: "Seek Program clip" })).not.toBeInTheDocument();
  expect(program.queryByRole("slider", { name: "Seek Preview clip" })).not.toBeInTheDocument();
  for (const group of [preview, program]) {
    expect(group.getByRole("slider", { name: "Seek Shared clip" }))
      .toHaveAccessibleDescription("Shared source: playback controls and seeking also change Program playback.");
    fireEvent.click(group.getByRole("button", { name: "Pause Shared clip" }));
  }
  expect(client.setMediaPlayback).toHaveBeenCalledTimes(2);
  expect(client.setMediaPlayback).toHaveBeenLastCalledWith("Shared clip", "pause");
  const slider = screen.getByRole("slider", { name: "Seek Preview clip" });
  scrub(slider, 12000);
  fireEvent.pointerUp(slider);
  expect(client.seekMedia).toHaveBeenCalledExactlyOnceWith("Preview clip", 12000);
});

it("shows Pause while playing and Play while paused/stopped, and sends Stop separately", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Pause Clip" }));
  expect(client.setMediaPlayback).toHaveBeenLastCalledWith("Clip", "pause");
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...clip, state: "OBS_MEDIA_STATE_PAUSED" }]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  fireEvent.click(screen.getByRole("button", { name: "Play Clip" }));
  expect(client.setMediaPlayback).toHaveBeenLastCalledWith("Clip", "play");
  fireEvent.click(screen.getByRole("button", { name: "Stop Clip" }));
  expect(client.setMediaPlayback).toHaveBeenLastCalledWith("Clip", "stop");
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...clip, state: "OBS_MEDIA_STATE_STOPPED", duration: null, cursor: null }]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole("button", { name: "Play Clip" })).not.toBeDisabled();
  expect(screen.getByRole("button", { name: "Stop Clip" })).toBeDisabled();
  expect(screen.getByRole("slider")).toHaveAttribute("aria-disabled", "true");
});

it("keeps playback controls available without a duration and guards busy or stale rows", async () => {
  vi.mocked(client.getActiveMedia).mockResolvedValue([{ ...clip, duration: null }]);
  const { rerender } = await mount();
  const pause = screen.getByRole("button", { name: "Pause Clip" });
  const stop = screen.getByRole("button", { name: "Stop Clip" });
  expect(pause).not.toBeDisabled();
  expect(stop).not.toBeDisabled();
  vi.mocked(useStudio).mockReturnValue({ client, ...client.getSnapshot(), syncing: true });
  rerender(<MediaSeekers />);
  expect(screen.getByRole("button", { name: "Pause Clip" })).toBe(pause);
  expect(pause).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(pause);
  fireEvent.click(stop);
  expect(client.setMediaPlayback).not.toHaveBeenCalled();
  vi.mocked(useStudio).mockReturnValue({ client, ...client.getSnapshot() });
  vi.mocked(client.getActiveMedia).mockRejectedValue(new Error("Unavailable"));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(pause).toBeDisabled();
  expect(stop).toBeDisabled();
});
