// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  expect(
    screen.getByRole("heading", { name: "Main studio" }),
  ).toBeInTheDocument();
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

it("keeps the refresh icon mounted without spinning or dimming during automatic synchronization", async () => {
  const refresh = vi.spyOn(client, "refresh").mockResolvedValue(undefined);
  const { rerender } = render(app("/studio"));
  const button = screen.getByRole("button", { name: "Refresh OBS state" });
  const icon = button.querySelector("svg");
  vi.mocked(useStudio).mockReturnValue({ client, ...connected, syncing: true });
  rerender(app("/studio"));
  expect(screen.getByRole("button", { name: "Refresh OBS state" })).toBe(
    button,
  );
  expect(button.querySelector("svg")).toBe(icon);
  expect(icon).not.toHaveClass("animate-spin");
  expect(button).not.toBeDisabled();
  expect(button).toHaveAttribute("aria-disabled", "true");
  await userEvent.setup().click(button);
  expect(refresh).not.toHaveBeenCalled();
});
