// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { isObsOnline } from "../src/lib/reachability";
import { saveProfiles } from "../src/lib/profiles";
import App from "../src/App";
import { StudioProvider } from "../src/context";
vi.mock("../src/lib/reachability", () => ({
  isObsOnline: vi.fn().mockResolvedValue(false),
}));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(isObsOnline).mockReset().mockResolvedValue(false);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("creates, edits, and deletes a connection and asks for a session password", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <StudioProvider>
        <App />
      </StudioProvider>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "Add connection" }));
  await user.type(screen.getByLabelText("Connection name"), "Main studio");
  await user.click(screen.getByRole("button", { name: "Save connection" }));
  expect(
    screen.getByRole("heading", { name: "Main studio" }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("studioctrl.connections.v1")).not.toContain(
    "password",
  );
  await user.click(
    screen.getByRole("button", { name: "Connect", exact: true }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByLabelText("OBS WebSocket password"),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Edit Main studio" }));
  await user.clear(screen.getByLabelText("Connection name"));
  await user.type(screen.getByLabelText("Connection name"), "Updated studio");
  await user.click(screen.getByRole("button", { name: "Save connection" }));
  expect(
    screen.getByRole("heading", { name: "Updated studio" }),
  ).toBeInTheDocument();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await user.click(
    screen.getByRole("button", { name: "Delete Updated studio" }),
  );
  expect(screen.getByText("No saved connections")).toBeInTheDocument();
});
it("defaults remembering passwords to off and supports explicitly opting in", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <StudioProvider>
        <App />
      </StudioProvider>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "Add connection" }));
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  await user.type(screen.getByLabelText("Connection name"), "Saved studio");
  await user.type(screen.getByLabelText("Saved password"), "my-test-password");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Save connection" }));
  expect(
    JSON.parse(localStorage.getItem("studioctrl.connections.v1")!)[0].password,
  ).toBe("my-test-password");
});

it("shows independent reachability badges for saved connections", async () => {
  saveProfiles([
    { id: "1", name: "Main", url: "ws://main:4455", rememberPassword: false },
    {
      id: "2",
      name: "Backup",
      url: "ws://backup:4455",
      rememberPassword: false,
    },
  ]);
  vi.mocked(isObsOnline).mockImplementation(async (url) =>
    url.includes("main"),
  );
  render(
    <MemoryRouter>
      <StudioProvider>
        <App />
      </StudioProvider>
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("status", { name: "Main: Online" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("status", { name: "Backup: Offline" }),
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "Connect", exact: true }),
  ).toHaveLength(2);
  expect(
    screen.queryByRole("button", { name: "Exit" }),
  ).not.toBeInTheDocument();
});
