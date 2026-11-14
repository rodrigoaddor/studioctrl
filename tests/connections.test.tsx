// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { isObsOnline } from "../src/lib/reachability";
import { saveProfiles } from "../src/lib/profiles";
import App from "../src/App";
import { StudioProvider } from "../src/context";
import { ConnectionCard } from "../src/components/connection-card";
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
    screen.getByRole("button", { name: "Connect to Main studio" }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("studioctrl.connections.v1")).not.toContain(
    "password",
  );
  await user.click(
    screen.getByRole("button", { name: "Connect to Main studio", exact: true }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByLabelText("OBS WebSocket password"),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  fireEvent.contextMenu(screen.getByRole("button", { name: "Connect to Main studio" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit connection" }));
  await user.clear(screen.getByLabelText("Connection name"));
  await user.type(screen.getByLabelText("Connection name"), "Updated studio");
  await user.click(screen.getByRole("button", { name: "Save connection" }));
  expect(
    screen.getByRole("button", { name: "Connect to Updated studio" }),
  ).toBeInTheDocument();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Connect to Updated studio" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete connection" }));
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
    screen.getAllByRole("button", { name: /^Connect to / }),
  ).toHaveLength(2);
  expect(
    screen.queryByRole("button", { name: "Exit" }),
  ).not.toBeInTheDocument();
});

const profile = {
  id: "card", name: "Main studio", url: "ws://main:4455", rememberPassword: false,
};
function renderCard(props: Partial<ComponentProps<typeof ConnectionCard>> = {}) {
  const actions = { onConnect: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  const result = render(
    <ConnectionCard profile={profile} connecting={false} connected={false} disabled={false} {...actions} {...props} />,
  );
  return { ...result, ...actions, card: screen.getByRole("button", { name: "Connect to Main studio" }) };
}

it("connects from anywhere on the card and with Enter or Space", async () => {
  const user = userEvent.setup();
  const { card, onConnect } = renderCard();
  await user.click(within(card).getByText(profile.name));
  await user.click(within(card).getByText(profile.url));
  await user.click(within(card).getByRole("status"));
  await user.click(within(card).getByText("Ask for password"));
  card.focus();
  await user.keyboard("{Enter} ");
  expect(onConnect).toHaveBeenCalledTimes(6);
  expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  expect(within(card).queryByRole("button")).not.toBeInTheDocument();
});

it("opens actions with right click or the keyboard without connecting", async () => {
  const user = userEvent.setup();
  const { card, onConnect, onEdit, onDelete } = renderCard();
  fireEvent.contextMenu(card);
  await user.click(screen.getByRole("menuitem", { name: "Edit connection" }));
  expect(onEdit).toHaveBeenCalledOnce();
  card.focus();
  await user.keyboard("{Shift>}{F10}{/Shift}");
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(onDelete).toHaveBeenCalledOnce();
  expect(onConnect).not.toHaveBeenCalled();
  card.focus();
  fireEvent.keyDown(card, { key: "ContextMenu" });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(card).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(onConnect).toHaveBeenCalledOnce();
});

function touch(card: HTMLElement, type: string) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerType: "touch", clientX: 20, clientY: 20 });
  fireEvent(card, event);
}

it("opens actions on long press and suppresses its click, then allows a new tap", async () => {
  vi.useFakeTimers();
  try {
    const { card, onConnect } = renderCard();
    touch(card, "pointerdown");
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(screen.getByRole("menuitem", { name: "Edit connection" })).toBeInTheDocument();
    touch(card, "pointerup");
    fireEvent.click(card);
    expect(onConnect).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    touch(card, "pointerdown");
    touch(card, "pointerup");
    fireEvent.click(card);
    expect(onConnect).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it.each(["pointermove", "pointercancel"])("cancels long press on %s", async (event) => {
  vi.useFakeTimers();
  try {
    const { card, onConnect } = renderCard();
    touch(card, "pointerdown");
    touch(card, event);
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onConnect).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("blocks card activation during a connection attempt while retaining its menu", async () => {
  const user = userEvent.setup();
  const { card, onConnect } = renderCard({ disabled: true, connecting: true });
  expect(card).toHaveAttribute("aria-disabled", "true");
  expect(card).toHaveAttribute("aria-busy", "true");
  expect(card).toHaveTextContent("Connecting…");
  await user.click(card);
  await user.keyboard("{Enter} ");
  expect(onConnect).not.toHaveBeenCalled();
  fireEvent.contextMenu(card);
  expect(screen.getByRole("menuitem", { name: "Edit connection" })).toBeInTheDocument();
});

it("shows and hides connection passwords without submitting, and masks reopened dialogs", async () => {
  const user = userEvent.setup();
  saveProfiles([profile]);
  render(
    <MemoryRouter>
      <StudioProvider><App /></StudioProvider>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "Add connection" }));
  const saved = screen.getByLabelText("Saved password");
  await user.type(saved, "saved-secret");
  expect(saved).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(saved).toHaveAttribute("type", "text");
  expect(saved).toHaveValue("saved-secret");
  await user.click(screen.getByRole("button", { name: "Hide password" }));
  expect(saved).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Add connection" }));
  expect(screen.getByLabelText("Saved password")).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Connect to Main studio" }));
  const session = screen.getByLabelText("OBS WebSocket password");
  await user.type(session, "session-secret");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(session).toHaveAttribute("type", "text");
  expect(session).toHaveValue("session-secret");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Connect to Main studio" }));
  expect(screen.getByLabelText("OBS WebSocket password")).toHaveAttribute("type", "password");
  expect(localStorage.getItem("studioctrl.connections.v1")).not.toContain("secret");
});
