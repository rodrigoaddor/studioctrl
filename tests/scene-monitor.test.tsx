// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SceneMonitor } from "../src/components/scene-monitor";
import { useStudio } from "../src/context";
import { StudioClient } from "../src/lib/obs";
import * as screenshots from "../src/lib/screenshot-preview";
import { monitorSettingsKey } from "../src/lib/monitor-settings";
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
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("offers independent saved modes and a disabled Remote Preview option", async () => {
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
  ).toHaveAttribute("data-disabled");
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
