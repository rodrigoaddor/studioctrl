// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemotePreview, RemotePreviewDialog } from "../src/components/remote-preview";
import * as remote from "../src/lib/remote-preview";

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });

it("ignores the old audio preference when editing connection settings", async () => {
  const user = userEvent.setup();
  localStorage.setItem("studioctrl.remote.v1:audio-dialog", JSON.stringify({ ...remote.emptyRemoteSettings, url: "https://media.example/live", audio: true }));
  const save = vi.fn();
  render(<RemotePreviewDialog settingsKey="audio-dialog" label="Preview" onSave={save} onClose={vi.fn()} />);
  expect(screen.queryByRole("checkbox", { name: "Enable audio" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save and connect" }));
  expect(save).toHaveBeenCalledWith(expect.not.objectContaining({ audio: true }));
});

it("starts muted even with a legacy enabled-audio preference", () => {
  const settings = { ...remote.emptyRemoteSettings, url: "https://media.example/live", audio: true };
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<RemotePreview settings={settings} onImageChange={vi.fn()} />);
  expect((screen.getByLabelText("Remote WebRTC stream") as HTMLVideoElement).muted).toBe(true);
});

it("retries browser-blocked playback directly from the Play stream button", async () => {
  const user = userEvent.setup();
  const start = vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<RemotePreview settings={{ ...remote.emptyRemoteSettings, url: "https://media.example/live" }} onImageChange={vi.fn()} />);
  act(() => start.mock.calls[0][3]!());
  expect(screen.queryByText("Connecting WebRTC…")).not.toBeInTheDocument();
  const play = vi.spyOn(screen.getByLabelText("Remote WebRTC stream") as HTMLVideoElement, "play").mockResolvedValue();
  await user.click(screen.getByRole("button", { name: "Play stream" }));
  expect(play).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Play stream" })).not.toBeInTheDocument();
  expect(start).toHaveBeenCalledOnce();
});


function AudioPreview() {
  return <RemotePreview settings={{ ...remote.emptyRemoteSettings, url: "https://media.example/live" }} onImageChange={imageChange} />;
}
const imageChange = () => {};

it("ignores hover caused by expanding or collapsing until the mouse moves", () => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerType: string;
    constructor(type: string, options: PointerEventInit = {}) { super(type, options); this.pointerType = options.pointerType ?? ""; }
  });
  const settings = remote.emptyRemoteSettings;
  const { rerender } = render(<RemotePreview settings={settings} onImageChange={imageChange} expanded={false} />);
  for (const expanded of [true, false]) {
    rerender(<RemotePreview settings={settings} onImageChange={imageChange} expanded={expanded} />);
    const surface = screen.getByRole("button", { name: "Show remote audio controls" });
    fireEvent.pointerEnter(surface, { pointerType: "mouse" });
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    fireEvent.pointerMove(surface, { pointerType: "mouse" });
    expect(screen.getByRole("slider")).toBeVisible();
  }
});

it("reveals controls on mouse hover and movement, preserves them on mouse click, and ignores touch hover", () => {
  vi.useFakeTimers();
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerType: string;
    constructor(type: string, options: PointerEventInit = {}) { super(type, options); this.pointerType = options.pointerType ?? ""; }
  });
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<RemotePreview settings={remote.emptyRemoteSettings} onImageChange={imageChange} />);
  const surface = screen.getByRole("button", { name: "Show remote audio controls" });
  fireEvent.pointerEnter(surface, { pointerType: "touch" });
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  fireEvent.pointerEnter(surface, { pointerType: "mouse" });
  expect(screen.getByRole("slider")).toBeVisible();
  fireEvent.pointerDown(surface, { pointerType: "mouse" });
  fireEvent.pointerUp(surface, { pointerType: "mouse" });
  fireEvent.click(surface);
  expect(screen.getByRole("slider")).toBeVisible();
  act(() => vi.advanceTimersByTime(2000));
  fireEvent.pointerMove(surface, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(2999));
  expect(screen.getByRole("slider")).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  fireEvent.pointerMove(surface, { pointerType: "mouse" });
  expect(screen.getByRole("slider")).toBeVisible();
});

it("reveals both controls on the first click when focus arrives after pointer release", () => {
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<><input aria-label="Other control" /><RemotePreview settings={{ ...remote.emptyRemoteSettings, url: "https://media.example/live" }} onImageChange={imageChange} /></>);
  act(() => screen.getByRole("textbox").focus());
  const surface = screen.getByRole("button", { name: "Show remote audio controls" });
  fireEvent.pointerDown(surface);
  fireEvent.pointerUp(surface);
  act(() => surface.focus());
  fireEvent.click(surface);
  expect(screen.getByRole("slider")).toBeVisible();
});

it("shows controls on video clicks and hides them three seconds after the last interaction", () => {
  vi.useFakeTimers();
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<AudioPreview />);
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  const surface = screen.getByRole("button", { name: "Show remote audio controls" });
  fireEvent.click(surface);
  expect(screen.getByRole("slider", { name: "Remote audio volume" })).toBeVisible();
  act(() => vi.advanceTimersByTime(2000));
  fireEvent.pointerUp(screen.getByRole("group", { name: "Remote audio controls" }));
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("slider")).toBeVisible();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

it("keeps focused or dragged controls visible and hides them after leaving", () => {
  vi.useFakeTimers();
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<AudioPreview />);
  fireEvent.click(screen.getByRole("button", { name: "Show remote audio controls" }));
  const slider = screen.getByRole("slider");
  act(() => slider.focus());
  act(() => vi.advanceTimersByTime(6000));
  expect(slider).toBeVisible();
  act(() => slider.blur());
  const group = screen.getByRole("group", { name: "Remote audio controls" });
  fireEvent.pointerDown(group);
  act(() => vi.advanceTimersByTime(6000));
  expect(slider).toBeVisible();
  fireEvent.pointerUp(group);
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

it.each(["pointerUp", "pointerCancel", "lostPointerCapture"] as const)("hides controls after touch %s even when the slider retains focus", (release) => {
  vi.useFakeTimers();
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<AudioPreview />);
  fireEvent.click(screen.getByRole("button", { name: "Show remote audio controls" }));
  const group = screen.getByRole("group", { name: "Remote audio controls" });
  const slider = screen.getByRole("slider");
  fireEvent.pointerDown(group, { pointerType: "touch" });
  act(() => slider.focus());
  act(() => vi.advanceTimersByTime(6000));
  expect(screen.getByRole("slider")).toBeVisible();
  fireEvent[release](group, { pointerType: "touch" });
  expect(slider).toHaveFocus();
  act(() => vi.advanceTimersByTime(2999));
  expect(screen.getByRole("slider")).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

it("retains controls for keyboard input after touching the slider", () => {
  vi.useFakeTimers();
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(<AudioPreview />);
  fireEvent.click(screen.getByRole("button", { name: "Show remote audio controls" }));
  const group = screen.getByRole("group", { name: "Remote audio controls" });
  const slider = screen.getByRole("slider");
  fireEvent.pointerDown(group);
  act(() => slider.focus());
  fireEvent.pointerUp(group);
  fireEvent.keyDown(slider, { key: "ArrowUp" });
  act(() => vi.advanceTimersByTime(6000));
  expect(screen.getByRole("slider")).toBeVisible();
});

it("starts muted again on retry and when the stream settings change", () => {
  const start = vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const settings = { ...remote.emptyRemoteSettings, url: "https://media.example/live" };
  const { rerender } = render(<RemotePreview settings={settings} onImageChange={imageChange} />);
  const player = screen.getByLabelText("Remote WebRTC stream") as HTMLVideoElement;
  const unmute = () => {
    fireEvent.click(screen.getByRole("button", { name: "Show remote audio controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Unmute remote audio" }));
    expect(player.muted).toBe(false);
  };
  unmute();
  act(() => start.mock.calls[0][2]("Connection lost"));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(player.muted).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Unmute remote audio" }));
  expect(player.muted).toBe(false);
  rerender(<RemotePreview settings={{ ...settings, url: "https://media.example/other" }} onImageChange={imageChange} />);
  expect(player.muted).toBe(true);
  expect(start).toHaveBeenCalledTimes(3);
});

it("changes volume, mutes at zero, and restores the last audible level without reconnecting", async () => {
  const user = userEvent.setup();
  const start = vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(<AudioPreview />);
  await user.click(screen.getByRole("button", { name: "Show remote audio controls" }));
  const slider = screen.getByRole("slider", { name: "Remote audio volume" });
  const player = screen.getByLabelText("Remote WebRTC stream") as HTMLVideoElement;
  act(() => slider.focus());
  await user.keyboard("{ArrowRight}");
  expect(player.volume).toBe(0.01);
  expect(player.muted).toBe(false);
  expect(slider).toHaveAttribute("aria-valuenow", "1");
  await user.keyboard("{End}");
  expect(player.volume).toBe(1);
  await user.keyboard("{ArrowLeft}");
  expect(player.volume).toBe(0.99);
  await user.click(screen.getByRole("button", { name: "Mute remote audio" }));
  expect(player.muted).toBe(true);
  await user.click(screen.getByRole("button", { name: "Unmute remote audio" }));
  expect(player.volume).toBe(0.99);
  expect(player.muted).toBe(false);
  act(() => slider.focus());
  await user.keyboard("{Home}");
  expect(player.volume).toBe(0);
  expect(player.muted).toBe(true);
  await user.click(screen.getByRole("button", { name: "Unmute remote audio" }));
  expect(player.volume).toBe(0.99);
  expect(start).toHaveBeenCalledOnce();
});


it("toggles controls on successive video clicks, including after focusing the slider", async () => {
  const tap = (element: HTMLElement) => { fireEvent.pointerDown(element); fireEvent.pointerUp(element); fireEvent.click(element); };
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<AudioPreview />);
  tap(screen.getByRole("button", { name: "Show remote audio controls" }));
  expect(screen.getByRole("slider")).toBeVisible();
  tap(screen.getByRole("button", { name: "Hide remote audio controls" }));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  tap(screen.getByRole("button", { name: "Show remote audio controls" }));
  act(() => screen.getByRole("slider").focus());
  tap(screen.getByRole("button", { name: "Hide remote audio controls" }));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

it.each([[1, "volume"], [33, "volume"], [34, "volume-1"], [66, "volume-1"], [67, "volume-2"], [100, "volume-2"]])("reflects %s percent volume in the icon", (volume, icon) => {
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(<AudioPreview />);
  fireEvent.click(screen.getByRole("button", { name: "Show remote audio controls" }));
  expect(screen.getByRole("button", { name: "Unmute remote audio" }).querySelector("svg")).toHaveClass("lucide-volume-x");
  const slider = screen.getByRole("slider");
  for (let i = 0; i < Number(volume); i++) fireEvent.keyDown(slider, { key: "ArrowUp" });
  expect(screen.getByRole("button", { name: "Mute remote audio" }).querySelector("svg")).toHaveClass(`lucide-${icon}`);
  fireEvent.click(screen.getByRole("button", { name: "Mute remote audio" }));
  expect(screen.getByRole("button", { name: "Unmute remote audio" }).querySelector("svg")).toHaveClass("lucide-volume-x");
});
