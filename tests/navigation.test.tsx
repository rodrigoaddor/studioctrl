// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "../src/App";
import { useStudio } from "../src/context";
import { StudioClient } from "../src/lib/obs";

vi.mock("../src/context", () => ({ useStudio: vi.fn() }));
const client = new StudioClient();
const connected = {
  ...client.getSnapshot(),
  status: "connected" as const,
  profile: {
    id: "1",
    name: "Main studio",
    url: "ws://localhost:4455",
    rememberPassword: false,
  },
};
function Location() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}
function app(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.mocked(useStudio).mockReturnValue({ client, ...connected });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("exits the active session and returns to connections", async () => {
  const user = userEvent.setup();
  const disconnect = vi.spyOn(client, "disconnect").mockImplementation(() => {
    vi.mocked(useStudio).mockReturnValue({ client, ...client.getSnapshot() });
  });
  render(app("/studio"));
  expect(
    screen.queryByRole("link", { name: /Connections/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Disconnect" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Exit", exact: true }));
  expect(disconnect).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Current route")).toHaveTextContent(/^\/$/);
  expect(
    screen.getByRole("button", { name: "Add connection" }),
  ).toBeInTheDocument();
});
it("redirects the connections route to the active studio", () => {
  render(app("/"));
  expect(screen.getByLabelText("Current route")).toHaveTextContent("/studio");
  expect(screen.getByTitle("Connected to Main studio")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Exit", exact: true }).parentElement)
    .toContainElement(screen.getByTitle("Connected to Main studio"));
  expect(
    screen.queryByRole("button", { name: "Add connection" }),
  ).not.toBeInTheDocument();
});
it("keeps the brand link in the studio while connected", async () => {
  render(app("/studio"));
  const brand = screen.getByRole("link", { name: /studioctrl/i });
  expect(brand).toHaveAttribute("href", "/studio");
  await userEvent.setup().click(brand);
  expect(screen.getByLabelText("Current route")).toHaveTextContent("/studio");
});

it("keeps the actions trigger stable during synchronization and blocks scene requests", async () => {
  const { rerender } = render(app("/studio"));
  const button = screen.getByRole("button", { name: "OBS actions" });
  const icon = button.querySelector("svg");
  vi.mocked(useStudio).mockReturnValue({ client, ...connected, syncing: true });
  rerender(app("/studio"));
  expect(screen.getByRole("button", { name: "OBS actions" })).toBe(button);
  expect(button.querySelector("svg")).toBe(icon);
  expect(icon).not.toHaveClass("animate-spin");
  button.focus();
  await userEvent.setup().keyboard("{ArrowDown}");
  expect(screen.queryByRole("menuitem", { name: /Refresh OBS state/i })).not.toBeInTheDocument();
  screen.getByRole("menuitem", { name: "Scenes", exact: true }).focus();
  await userEvent.setup().keyboard("{ArrowRight}");
  expect(
    screen.getByRole("menuitem", { name: "Generate Previews" }),
  ).toHaveAttribute("data-disabled");
  expect(screen.getByRole("menuitem", { name: "Reset Previews" })).toHaveAttribute("data-disabled");
});

it("toggles hidden scene visibility from OBS actions", async () => {
  const toggle = vi.spyOn(client, "setShowHiddenScenes");
  render(app("/studio"));
  await userEvent.setup().click(screen.getByRole("button", { name: "OBS actions" }));
  expect(screen.queryByRole("menuitemcheckbox", { name: "Show hidden scenes" })).not.toBeInTheDocument();
  screen.getByRole("menuitem", { name: "Scenes", exact: true }).focus();
  await userEvent.setup().keyboard("{ArrowRight}");
  const item = screen.getByRole("menuitemcheckbox", { name: "Show hidden scenes" });
  expect(item).toHaveAttribute("aria-checked", "false");
  await userEvent.setup().click(item);
  expect(toggle).toHaveBeenCalledExactlyOnceWith(true);
});

function mockFullscreen() {
  let element: Element | null = null;
  const change = (value: Element | null) => {
    element = value;
    document.dispatchEvent(new Event("fullscreenchange"));
  };
  const request = vi.fn(async () => change(document.documentElement));
  const exit = vi.fn(async () => change(null));
  const properties = [
    [document, "fullscreenEnabled", { value: true, writable: true }],
    [document, "fullscreenElement", { get: () => element }],
    [document.documentElement, "requestFullscreen", { value: request }],
    [document, "exitFullscreen", { value: exit }],
  ] as const;
  for (const [target, key, descriptor] of properties) {
    const original = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { ...descriptor, configurable: true });
    fullscreenCleanup.push(() => {
      if (original) Object.defineProperty(target, key, original);
      else Reflect.deleteProperty(target, key);
    });
  }
  return { request, exit, change };
}
const fullscreenCleanup: (() => void)[] = [];
afterEach(() => {
  fullscreenCleanup.splice(0).reverse().forEach((restore) => restore());
});

it("enters and exits document fullscreen even while OBS is busy", async () => {
  const { request, exit } = mockFullscreen();
  vi.mocked(useStudio).mockReturnValue({ client, ...connected, busy: true });
  render(app("/studio"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "OBS actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Fullscreen", exact: true }));
  expect(request).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "OBS actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Exit fullscreen" }));
  expect(exit).toHaveBeenCalledOnce();
});

it("updates the open fullscreen action when the browser exits fullscreen", async () => {
  const { change } = mockFullscreen();
  change(document.documentElement);
  render(app("/studio"));
  await userEvent.setup().click(screen.getByRole("button", { name: "OBS actions" }));
  expect(screen.getByRole("menuitem", { name: "Exit fullscreen" })).toBeInTheDocument();
  act(() => change(null));
  expect(screen.getByRole("menuitem", { name: "Fullscreen", exact: true })).toBeInTheDocument();
});

it("disables fullscreen when the browser does not support it", async () => {
  mockFullscreen();
  Object.defineProperty(document, "fullscreenEnabled", { value: false });
  render(app("/studio"));
  await userEvent.setup().click(screen.getByRole("button", { name: "OBS actions" }));
  expect(screen.getByRole("menuitem", { name: "Fullscreen", exact: true })).toHaveAttribute("data-disabled");
});

it("shows dismissible feedback when fullscreen is rejected", async () => {
  const { request } = mockFullscreen();
  request.mockRejectedValue(new Error("Permission denied"));
  render(app("/studio"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "OBS actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Fullscreen", exact: true }));
  expect(screen.getByRole("alert")).toHaveTextContent("Could not change fullscreen mode");
  await user.click(screen.getByRole("button", { name: "Dismiss error" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it.each(["disconnected", "connecting"] as const)(
  "offers fullscreen without OBS actions while %s on connections",
  async (status) => {
    const { request, exit } = mockFullscreen();
    vi.mocked(useStudio).mockReturnValue({
      client,
      ...client.getSnapshot(),
      status,
    });
    render(app("/"));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "App actions" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByRole("menuitem", { name: "Language" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Connected to Main studio")).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Fullscreen", exact: true }));
    expect(request).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "App actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Exit fullscreen" }));
    expect(exit).toHaveBeenCalledOnce();
  },
);


it.each(["stream", "recording"] as const)("starts inactive %s from the menu", async (output) => {
  vi.spyOn(client, "getOutputStatuses").mockResolvedValue({
    stream: { active: false, duration: 0 }, recording: { active: false, duration: 0 },
  });
  const start = vi.spyOn(client, "setOutputActive").mockResolvedValue(true);
  render(app("/studio"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "OBS actions" }));
  expect(within(screen.getByRole("menu")).getByText("Connected to Main studio")).toBeInTheDocument();
  await user.click(await screen.findByRole("menuitem", { name: output === "stream" ? "Start streaming" : "Start recording" }));
  expect(start).toHaveBeenCalledExactlyOnceWith(output, true);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

it.each(["stream", "recording"] as const)("confirms stopping %s and supports cancellation", async (output) => {
  vi.spyOn(client, "getOutputStatuses").mockResolvedValue({
    stream: { active: true, duration: 65_000 }, recording: { active: true, duration: 125_000 },
  });
  const stop = vi.spyOn(client, "setOutputActive").mockResolvedValue(true);
  render(app("/studio"));
  const user = userEvent.setup();
  const label = output === "stream" ? "streaming" : "recording";
  async function openStop() {
    await user.click(screen.getByRole("button", { name: "OBS actions" }));
    await user.click(await screen.findByRole("menuitem", { name: output === "stream" ? "Streaming 00:01:05" : "Recording 00:02:05" }));
  }
  await openStop();
  expect(screen.getByRole("alertdialog", { name: `Stop ${label}?` })).toBeInTheDocument();
  expect(stop).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Cancel", exact: true })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(stop).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "OBS actions" })).toHaveFocus();
  await openStop();
  await user.click(screen.getByRole("button", { name: `Stop ${label}`, exact: true }));
  expect(stop).toHaveBeenCalledExactlyOnceWith(output, false);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

it("keeps stop confirmation open on failure and discards it after a session change", async () => {
  vi.spyOn(client, "getOutputStatuses").mockResolvedValue({
    stream: { active: true, duration: 1000 }, recording: null,
  });
  const stop = vi.spyOn(client, "setOutputActive").mockResolvedValue(false);
  const view = render(app("/studio"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "OBS actions" }));
  expect(await screen.findByRole("menuitem", { name: "Recording unavailable" })).toHaveAttribute("data-disabled");
  await user.click(screen.getByRole("menuitem", { name: "Streaming 00:00:01" }));
  await user.click(screen.getByRole("button", { name: "Stop streaming", exact: true }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Could not stop streaming");
  vi.mocked(useStudio).mockReturnValue({ client, ...connected, profile: { ...connected.profile, id: "other", name: "Other OBS" } });
  view.rerender(app("/studio"));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(stop).toHaveBeenCalledTimes(1);
});

it("blocks repeated stop requests while waiting for OBS", async () => {
  vi.spyOn(client, "getOutputStatuses").mockResolvedValue({
    stream: { active: true, duration: 1000 }, recording: { active: false, duration: 0 },
  });
  let resolve!: (success: boolean) => void;
  const stop = vi.spyOn(client, "setOutputActive").mockImplementation(() => new Promise((done) => { resolve = done; }));
  render(app("/studio"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "OBS actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Streaming 00:00:01" }));
  await user.click(screen.getByRole("button", { name: "Stop streaming", exact: true }));
  const stopping = screen.getByRole("button", { name: "Stopping…" });
  expect(stopping).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await user.click(stopping);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(stop).toHaveBeenCalledExactlyOnceWith("stream", false);
  await act(async () => { resolve(true); });
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

it("saves the preview borders toggle in the Scenes submenu even while OBS is busy", async () => {
  vi.mocked(useStudio).mockReturnValue({ client, ...connected, busy: true });
  const { unmount } = render(app("/studio"));
  const user = userEvent.setup();
  async function openScenes() {
    await user.click(screen.getByRole("button", { name: "OBS actions" }));
    screen.getByRole("menuitem", { name: "Scenes", exact: true }).focus();
    await user.keyboard("{ArrowRight}");
  }
  await openScenes();
  const toggle = screen.getByRole("menuitemcheckbox", { name: "Show preview borders" });
  expect(toggle).toHaveAttribute("aria-checked", "true");
  await user.click(toggle);
  expect(localStorage.getItem("studioctrl.monitor.v1:borders")).toBe("false");
  unmount();
  render(app("/studio"));
  await openScenes();
  expect(screen.getByRole("menuitemcheckbox", { name: "Show preview borders" })).toHaveAttribute("aria-checked", "false");
});

it("resets previews from the Scenes submenu", async () => {
  const reset = vi.spyOn(client, "resetPreviews").mockResolvedValue(undefined);
  render(app("/studio"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "OBS actions" }));
  screen.getByRole("menuitem", { name: "Scenes", exact: true }).focus();
  await user.keyboard("{ArrowRight}");
  await user.click(screen.getByRole("menuitem", { name: "Reset Previews" }));
  expect(reset).toHaveBeenCalledOnce();
});

it("groups output controls without a visible heading and generates previews from the Scenes submenu", async () => {
  vi.mocked(useStudio).mockReturnValue({ client, ...connected, studio: true });
  vi.spyOn(client, "getOutputStatuses").mockResolvedValue({
    stream: { active: false, duration: 0 }, recording: { active: false, duration: 0 },
  });
  const generate = vi.spyOn(client, "generatePreviews").mockResolvedValue(undefined);
  render(app("/studio"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "OBS actions" }));
  const status = screen.getByRole("group", { name: "Status" });
  expect(screen.queryByText("Status", { exact: true })).not.toBeInTheDocument();
  expect(await within(status).findByRole("menuitem", { name: "Start streaming" })).toBeInTheDocument();
  expect(within(status).getByRole("menuitem", { name: "Start recording" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Generate Previews" })).not.toBeInTheDocument();
  screen.getByRole("menuitem", { name: "Scenes", exact: true }).focus();
  await user.keyboard("{ArrowRight}");
  await user.click(screen.getByRole("menuitem", { name: "Generate Previews" }));
  expect(generate).toHaveBeenCalledOnce();
});
