// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
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
  expect(screen.getByText("Connected to Main studio")).toBeInTheDocument();
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

it("keeps the actions trigger stable during synchronization and blocks refresh", async () => {
  const refresh = vi.spyOn(client, "refresh").mockResolvedValue(undefined);
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
  expect(
    screen.getByRole("menuitem", { name: "Refresh OBS state" }),
  ).toHaveAttribute("data-disabled");
  expect(
    screen.getByRole("menuitem", { name: "Generate Previews" }),
  ).toHaveAttribute("data-disabled");
  expect(refresh).not.toHaveBeenCalled();
});
it("refreshes from the actions dropdown", async () => {
  const refresh = vi.spyOn(client, "refresh").mockResolvedValue(undefined);
  render(app("/studio"));
  screen.getByRole("button", { name: "OBS actions" }).focus();
  const user = userEvent.setup();
  await user.keyboard("{ArrowDown}");
  await user.click(screen.getByRole("menuitem", { name: "Refresh OBS state" }));
  expect(refresh).toHaveBeenCalledOnce();
});

it("toggles hidden scene visibility from OBS actions", async () => {
  const toggle = vi.spyOn(client, "setShowHiddenScenes");
  render(app("/studio"));
  await userEvent.setup().click(screen.getByRole("button", { name: "OBS actions" }));
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
