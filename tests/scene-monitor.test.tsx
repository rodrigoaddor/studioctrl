// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SceneMonitor } from "../src/components/scene-monitor";
import { useStudio } from "../src/context";
import { StudioClient } from "../src/lib/obs";
import * as remote from "../src/lib/remote-preview";
import { PreviewToggle } from "../src/components/preview-toggle";
import * as screenshots from "../src/lib/screenshot-preview";
import { monitorSettingsKey, saveMonitorBorders } from "../src/lib/monitor-settings";
vi.mock("../src/context", () => ({ useStudio: vi.fn() }));
const client = new StudioClient();
beforeEach(() => {
  localStorage.clear();
  vi.mocked(useStudio).mockReturnValue({
    client,
    ...client.getSnapshot(),
    status: "connected",
    studio: true,
    profile: {
      id: "studio",
      name: "Studio",
      url: "ws://localhost:4455",
      rememberPassword: false,
    },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it.each(["preview", "program"] as const)("anchors %s settings beside the scene name in the header", (kind) => {
  render(<SceneMonitor kind={kind} sceneName="Camera" />);
  const settings = screen.getByRole("button", { name: `${kind === "preview" ? "Preview" : "Program"} settings` });
  expect(settings.parentElement?.querySelector('[title="Camera"]')).not.toHaveClass("sm:hidden");
  expect(settings).toHaveClass("col-start-3");
});

it.each(["obs", "remote"])("toggles both colored picture borders in %s mode without replacing playback", (mode) => {
  localStorage.setItem(monitorSettingsKey("studio", "preview"), mode);
  localStorage.setItem(monitorSettingsKey("studio", "program"), mode);
  const start = vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<><SceneMonitor kind="preview" sceneName="Camera" /><SceneMonitor kind="program" sceneName="Slides" /></>);
  expect(document.querySelector('[data-monitor-border="preview"]')).toHaveClass("border-x-3", "border-b-3", "border-preview");
  expect(document.querySelector('[data-monitor-border="program"]')).toHaveClass("border-program");
  const players = [...document.querySelectorAll("canvas, video")];
  const connections = start.mock.calls.length;
  fireEvent.click(screen.getAllByRole("button", { name: "Expand preview" })[0]);
  expect(screen.getByRole("dialog").querySelector('[data-monitor-border="preview"]')).toHaveClass("border-preview");
  act(() => saveMonitorBorders(false));
  expect(document.querySelector("[data-monitor-border]")).not.toBeInTheDocument();
  const currentPlayers = [...document.querySelectorAll("canvas, video")];
  expect(currentPlayers).toHaveLength(players.length);
  players.forEach((player) => expect(currentPlayers).toContain(player));
  act(() => saveMonitorBorders(true));
  expect(document.querySelectorAll("[data-monitor-border]")).toHaveLength(2);
  expect(start).toHaveBeenCalledTimes(connections);
});

it("omits colored picture borders in No Preview mode", () => {
  render(<SceneMonitor kind="preview" sceneName="Camera" />);
  expect(document.querySelector("[data-monitor-border]")).not.toBeInTheDocument();
});

it.each(["none", "obs", "remote"])("keeps the header and expand action above the picture in %s mode", (mode) => {
  localStorage.setItem(monitorSettingsKey("studio", "preview"), mode);
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<SceneMonitor kind="preview" sceneName="Camera" />);
  const settings = screen.getByRole("button", { name: "Preview settings" });
  const header = settings.parentElement!;
  expect(header).not.toHaveClass("absolute");
  expect(within(header).getByText("Camera")).toBeInTheDocument();
  expect(settings.nextElementSibling).toBe(screen.getByRole("button", { name: "Expand preview" }));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Expand preview" })).toBeVisible();
});

it.each(["preview", "program"] as const)("warns when OBS stops streaming in the %s remote monitor without restarting playback", (kind) => {
  localStorage.setItem(monitorSettingsKey("studio", kind), "remote");
  remote.saveRemoteSettings(`studio:${kind}`, { ...remote.emptyRemoteSettings, url: "https://media.example/live" });
  const start = vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  const { rerender } = render(<SceneMonitor kind={kind} sceneName="Camera" />);
  expect(screen.queryByText("OBS is not streaming")).not.toBeInTheDocument();
  rerender(<SceneMonitor kind={kind} sceneName="Camera" streaming={false} />);
  expect(screen.getByText("OBS is not streaming")).toBeInTheDocument();
  expect(screen.getByText("Connecting WebRTC…")).toBeInTheDocument();
  fireEvent.playing(screen.getByLabelText("Remote WebRTC stream"));
  expect(screen.queryByText("Connecting WebRTC…")).not.toBeInTheDocument();
  expect(screen.getByText("OBS is not streaming")).toBeInTheDocument();
  rerender(<SceneMonitor kind={kind} sceneName="Camera" streaming />);
  expect(screen.queryByText("OBS is not streaming")).not.toBeInTheDocument();
  rerender(<SceneMonitor kind={kind} sceneName="Camera" streaming={false} />);
  expect(screen.getByText("OBS is not streaming")).toBeInTheDocument();
  expect(start).toHaveBeenCalledOnce();
});

it.each(["none", "obs"])("does not show a remote streaming warning in %s mode", (mode) => {
  localStorage.setItem(monitorSettingsKey("studio", "preview"), mode);
  render(<SceneMonitor kind="preview" sceneName="Camera" streaming={false} />);
  expect(screen.queryByText("OBS is not streaming")).not.toBeInTheDocument();
});

it("offers independent saved modes and a configurable Remote Preview option", async () => {
  const user = userEvent.setup();
  const { unmount } = render(
    <>
      <SceneMonitor kind="preview" sceneName="Camera" />
      <SceneMonitor kind="program" sceneName="Slides" />
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Preview settings" });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  expect(
    screen.getByRole("menuitemradio", { name: "No Preview" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(
    screen.getByRole("menuitemradio", { name: "Remote Preview" }),
  ).not.toHaveAttribute("data-disabled");
  await user.click(screen.getByRole("menuitemradio", { name: "No Preview" }));
  expect(localStorage.getItem(monitorSettingsKey("studio", "preview"))).toBe(
    "none",
  );
  expect(
    localStorage.getItem(monitorSettingsKey("studio", "program")),
  ).toBeNull();
  expect(
    within(screen.getByRole("article", { name: "Preview monitor" })).getByRole(
      "heading",
      { name: "Camera" },
    ),
  ).toBeInTheDocument();
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  await user.click(screen.getByRole("menuitemradio", { name: "OBS Preview" }));
  expect(localStorage.getItem(monitorSettingsKey("studio", "preview"))).toBe(
    "obs",
  );
  unmount();
  render(<SceneMonitor kind="preview" sceneName="Camera" />);
  screen.getByRole("button", { name: "Preview settings" }).focus();
  await user.keyboard("{ArrowDown}");
  expect(
    screen.getByRole("menuitemradio", { name: "OBS Preview" }),
  ).toHaveAttribute("aria-checked", "true");
});
it("does not capture disabled previews and restores the setting on remount", () => {
  localStorage.setItem(monitorSettingsKey("studio", "preview"), "none");
  const capture = vi.spyOn(client, "getScreenshot");
  const { unmount } = render(
    <SceneMonitor kind="preview" sceneName="Camera" />,
  );
  expect(screen.getByRole("heading", { name: "Camera" })).toBeInTheDocument();
  expect(capture).not.toHaveBeenCalled();
  unmount();
  render(<SceneMonitor kind="preview" sceneName="Camera" />);
  expect(capture).not.toHaveBeenCalled();
});

it("defaults to no preview without starting screenshot capture", () => {
  const capture = vi.spyOn(client, "getScreenshot");
  render(<SceneMonitor kind="preview" sceneName="Camera" />);
  expect(screen.getByRole("heading", { name: "Camera" })).toBeInTheDocument();
  expect(capture).not.toHaveBeenCalled();
});

it("moves the scene name into the overlay while live and restores the fallback on failure", () => {
  localStorage.setItem(monitorSettingsKey("studio", "preview"), "obs");
  let onPhase!: Parameters<
    typeof screenshots.startScreenshotPreview
  >[0]["onPhase"];
  vi.spyOn(screenshots, "startScreenshotPreview").mockImplementation(
    (options) => {
      onPhase = options.onPhase;
      onPhase("live");
      return vi.fn();
    },
  );
  render(<SceneMonitor kind="preview" sceneName="Camera" />);
  expect(
    screen.queryByRole("heading", { name: "Camera" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Camera", { exact: true })).toHaveAttribute(
    "title",
    "Camera",
  );
  expect(screen.getByText("Preview", { exact: true })).toBeInTheDocument();
  act(() => onPhase("error"));
  expect(screen.getByRole("heading", { name: "Camera" })).toBeInTheDocument();
  expect(screen.getByText("Preview", { exact: true })).toBeInTheDocument();
});

it("uses a cached media image before useful playback and returns to live when ready", () => {
  localStorage.setItem(monitorSettingsKey("studio", "preview"), "obs");
  const capture = vi.spyOn(client, "getScreenshot");
  const state = {
    ...vi.mocked(useStudio).getMockImplementation()!(),
    thumbnails: { Camera: "data:image/jpeg;base64,saved" },
  };
  vi.mocked(useStudio).mockReturnValue(state);
  const { rerender } = render(
    <SceneMonitor kind="preview" sceneName="Camera" />,
  );
  expect(screen.getByAltText("Cached preview of Camera")).toBeInTheDocument();
  expect(screen.getByText("Video Preview")).toBeInTheDocument();
  expect(capture).not.toHaveBeenCalled();
  vi.spyOn(screenshots, "startScreenshotPreview").mockImplementation(
    ({ onPhase }) => {
      onPhase("live");
      return vi.fn();
    },
  );
  vi.mocked(useStudio).mockReturnValue({ ...state, previewReady: "Camera" });
  rerender(<SceneMonitor kind="preview" sceneName="Camera" />);
  expect(
    screen.queryByAltText("Cached preview of Camera"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Video Preview")).not.toBeInTheDocument();
});

it("crossfades Program for the configured duration without restarting incoming playback at the end", () => {
  vi.useFakeTimers();
  localStorage.setItem(monitorSettingsKey("studio", "program"), "obs");
  const stop = vi.fn();
  const loops: Parameters<typeof screenshots.startScreenshotPreview>[0][] = [];
  vi.spyOn(screenshots, "startScreenshotPreview").mockImplementation((options) => {
    loops.push(options);
    options.onPhase("live");
    return stop;
  });
  const state = vi.mocked(useStudio).getMockImplementation()!();
  const { container, rerender } = render(<SceneMonitor kind="program" sceneName="Camera" />);
  const outgoing = screen.getByLabelText("Program screenshot of Camera");
  const monitorFade = { from: "Camera", to: "Slides", duration: 1200, startedAt: performance.now() };
  vi.mocked(useStudio).mockReturnValue({ ...state, monitorFade });
  rerender(<SceneMonitor kind="program" sceneName="Camera" />);
  const incoming = screen.getByLabelText("Program screenshot of Slides");
  expect(screen.getByLabelText("Program screenshot of Camera")).toBe(outgoing);
  expect(container.querySelector<HTMLElement>("[data-program-fade]")?.style.animationDuration).toBe("1200ms");
  expect(screen.getByRole("button", { name: "Program settings" }).closest("[data-program-fade]")).toBeNull();
  // OBS can swap its scene state before the local fade finishes.
  rerender(<SceneMonitor kind="program" sceneName="Slides" />);
  act(() => vi.advanceTimersByTime(1199));
  expect(outgoing).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(outgoing).not.toBeInTheDocument();
  expect(screen.getByLabelText("Program screenshot of Slides")).toBe(incoming);
  expect(loops).toHaveLength(2);
  expect(stop).toHaveBeenCalledOnce();
  // A collection/session reset discards the old composite.
  vi.mocked(useStudio).mockReturnValue({ ...state, monitorFade: null, previewEpoch: 1 });
  rerender(<SceneMonitor kind="program" sceneName="Slides" />);
  expect(container.querySelector("[data-program-fade]")).toBeNull();
  vi.useRealTimers();
});

it("does not animate Preview or disabled Program previews", () => {
  const state = vi.mocked(useStudio).getMockImplementation()!();
  vi.mocked(useStudio).mockReturnValue({ ...state,
    monitorFade: { from: "Camera", to: "Slides", duration: 300, startedAt: performance.now() },
  });
  const { container } = render(<>
    <SceneMonitor kind="program" sceneName="Camera" />
    <SceneMonitor kind="preview" sceneName="Slides" />
  </>);
  expect(container.querySelector("[data-program-fade]")).toBeNull();
});

it("opens the remote configuration without changing mode on cancel, then saves per monitor", async () => {
  const user = userEvent.setup();
  vi.spyOn(remote, "readRemoteSettings").mockReturnValue(remote.emptyRemoteSettings);
  render(<SceneMonitor kind="preview" sceneName="Camera" />);
  await user.click(screen.getByRole("button", { name: "Preview settings" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Remote Preview" }));
  expect(screen.getByRole("dialog", { name: "Preview · Remote Preview" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(localStorage.getItem(monitorSettingsKey("studio", "preview"))).toBeNull();
  await user.click(screen.getByRole("button", { name: "Preview settings" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Remote Preview" }));
  await user.type(screen.getByLabelText("WebRTC URL", { exact: false }), "https://media.example/live");
  await user.selectOptions(screen.getByLabelText("Authentication"), "basic");
  await user.type(screen.getByLabelText("Username", { exact: true }), "operator");
  await user.type(screen.getByLabelText("Password", { exact: true }), "private-password");
  const password = screen.getByLabelText("Password", { exact: true });
  expect(password).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(password).toHaveAttribute("type", "text");
  expect(password).toHaveValue("private-password");
  await user.click(screen.getByRole("button", { name: "Hide password" }));
  expect(password).toHaveAttribute("type", "password");
  await user.selectOptions(screen.getByLabelText("Authentication"), "bearer");
  const token = screen.getByLabelText("Bearer token", { exact: true });
  await user.type(token, "private-token");
  expect(token).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "Show bearer token" }));
  expect(token).toHaveAttribute("type", "text");
  expect(token).toHaveValue("private-token");
  await user.click(screen.getByRole("button", { name: "Hide bearer token" }));
  expect(token).toHaveAttribute("type", "password");
  await user.selectOptions(screen.getByLabelText("Authentication"), "basic");
  expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute("type", "password");

  await user.click(screen.getByRole("button", { name: "Save and connect" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(localStorage.getItem(monitorSettingsKey("studio", "preview"))).toBe("remote");
  expect(localStorage.getItem(monitorSettingsKey("studio", "program"))).toBeNull();
  expect(localStorage.getItem("studioctrl.remote.v1:studio:preview")).not.toContain("private-password");
  expect(screen.getByLabelText("Remote WebRTC stream")).toBeInTheDocument();
});

it.each(["preview", "program"] as const)("switches the %s monitor to saved Remote Preview directly and keeps configuration separate", async (kind) => {
  const user = userEvent.setup();
  remote.saveRemoteSettings(`studio:${kind}`, { ...remote.emptyRemoteSettings, url: "https://media.example/saved" });
  const start = vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<SceneMonitor kind={kind} sceneName="Camera" />);
  const trigger = screen.getByRole("button", { name: `${kind === "preview" ? "Preview" : "Program"} settings` });
  await user.click(trigger);
  await user.click(screen.getByRole("menuitemradio", { name: "Remote Preview" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(localStorage.getItem(monitorSettingsKey("studio", kind))).toBe("remote");
  expect(start).toHaveBeenCalledOnce();
  await user.click(trigger);
  await user.click(screen.getByRole("menuitemradio", { name: "Remote Preview" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(start).toHaveBeenCalledOnce();
  await user.click(trigger);
  await user.click(screen.getByRole("menuitemradio", { name: "OBS Preview" }));
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Configure Remote Preview…" }));
  expect(screen.getByLabelText("WebRTC URL", { exact: false })).toHaveValue("https://media.example/saved/whep");
  expect(localStorage.getItem(monitorSettingsKey("studio", kind))).toBe("obs");
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(localStorage.getItem(monitorSettingsKey("studio", kind))).toBe("obs");
  expect(start).toHaveBeenCalledOnce();
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  await user.click(screen.getByRole("menuitemradio", { name: "Remote Preview" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(start).toHaveBeenCalledTimes(2);
});

it("keeps remote playback through scene changes and restores it with the combined toggle", async () => {
  const user = userEvent.setup();
  remote.saveRemoteSettings("studio:program", { ...remote.emptyRemoteSettings, url: "https://media.example/live" });
  const { saveMonitorMode } = await import("../src/lib/monitor-settings");
  saveMonitorMode(monitorSettingsKey("studio", "program"), "remote");
  saveMonitorMode(monitorSettingsKey("studio", "preview"), "obs");
  const stop = vi.fn();
  const start = vi.spyOn(remote, "startRemotePreview").mockReturnValue(stop);
  const { rerender } = render(<><SceneMonitor kind="program" sceneName="Camera" /><PreviewToggle /></>);
  expect(start).toHaveBeenCalledTimes(1);
  rerender(<><SceneMonitor kind="program" sceneName="Slides" /><PreviewToggle /></>);
  expect(start).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Hide Previews" }));
  expect(stop).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Show Previews" }));
  expect(localStorage.getItem(monitorSettingsKey("studio", "program"))).toBe("remote");
  expect(start).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "Program settings" }));
  await user.click(screen.getByRole("menuitem", { name: "Configure Remote Preview…" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(start).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Program settings" })).toHaveFocus();
});


it.each(["preview", "program"] as const)("expands the %s monitor with a separate header and preserves the player", async (kind) => {
  const user = userEvent.setup();
  localStorage.setItem(monitorSettingsKey("studio", kind), "remote");
  remote.saveRemoteSettings(`studio:${kind}`, { ...remote.emptyRemoteSettings, url: "https://media.example/live" });
  const start = vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(<SceneMonitor kind={kind} sceneName="Camera" />);
  const player = screen.getByLabelText("Remote WebRTC stream") as HTMLVideoElement;
  await user.click(screen.getByRole("button", { name: "Show remote audio controls" }));
  await user.click(screen.getByRole("button", { name: "Unmute remote audio" }));
  await user.click(screen.getByRole("button", { name: "Expand preview" }));
  const dialog = screen.getByRole("dialog", { name: `${kind === "preview" ? "Preview" : "Program"} monitor` });
  expect(within(dialog).getByText("Camera")).toBeInTheDocument();
  const settings = within(dialog).getByRole("button", { name: `${kind === "preview" ? "Preview" : "Program"} settings` });
  expect(settings.parentElement).not.toHaveClass("absolute");
  expect(within(dialog).getByLabelText("Remote WebRTC stream")).toBe(player);
  expect(player.muted).toBe(false);
  await user.click(settings);
  await user.click(screen.getByRole("menuitem", { name: "Configure Remote Preview…" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(settings).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Remote WebRTC stream")).toBe(player);
  expect(player.muted).toBe(false);
  expect(screen.getByRole("button", { name: "Expand preview" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Expand preview" }));
  expect(screen.queryByRole("button", { name: "Close expanded preview" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Collapse preview" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Remote WebRTC stream")).toBe(player);
  expect(start).toHaveBeenCalledOnce();
});

it("does not reveal volume when expanding or collapsing the preview", async () => {
  const user = userEvent.setup();
  localStorage.setItem(monitorSettingsKey("studio", "preview"), "remote");
  vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  render(<SceneMonitor kind="preview" sceneName="Camera" />);
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Expand preview" }));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Collapse preview" }));
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

it("toggles remote sound independently in each monitor without reconnecting", async () => {
  const user = userEvent.setup();
  for (const kind of ["preview", "program"] as const) {
    localStorage.setItem(monitorSettingsKey("studio", kind), "remote");
    remote.saveRemoteSettings(`studio:${kind}`, { ...remote.emptyRemoteSettings, url: "https://media.example/live" });
  }
  const start = vi.spyOn(remote, "startRemotePreview").mockReturnValue(vi.fn());
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const { unmount } = render(<><SceneMonitor kind="preview" sceneName="Camera" /><SceneMonitor kind="program" sceneName="Slides" /></>);
  const preview = within(screen.getByRole("article", { name: "Preview monitor" }));
  const program = within(screen.getByRole("article", { name: "Program monitor" }));
  await user.click(preview.getByRole("button", { name: "Show remote audio controls" }));
  await user.click(preview.getByRole("button", { name: "Unmute remote audio" }));
  expect((preview.getByLabelText("Remote WebRTC stream") as HTMLVideoElement).muted).toBe(false);
  expect((program.getByLabelText("Remote WebRTC stream") as HTMLVideoElement).muted).toBe(true);
  expect(preview.getByRole("button", { name: "Mute remote audio" })).toBeInTheDocument();
  expect(play).toHaveBeenCalledOnce();
  expect(start).toHaveBeenCalledTimes(2);
  expect(remote.readRemoteSettings("studio:preview")).not.toHaveProperty("audio");
  expect(remote.readRemoteSettings("studio:program")).not.toHaveProperty("audio");
  unmount();
  render(<SceneMonitor kind="preview" sceneName="Camera" />);
  await user.click(screen.getByRole("button", { name: "Show remote audio controls" }));
  expect(screen.getByRole("button", { name: "Unmute remote audio" })).toBeInTheDocument();
  expect((screen.getByLabelText("Remote WebRTC stream") as HTMLVideoElement).muted).toBe(true);
  expect(start).toHaveBeenCalledTimes(3);
});
