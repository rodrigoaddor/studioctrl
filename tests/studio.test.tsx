// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Studio } from "../src/pages/studio";
import { useStudio } from "../src/context";
import { monitorSettingsKey } from "../src/lib/monitor-settings";
import { StudioClient } from "../src/lib/obs";

vi.mock("../src/context", () => ({ useStudio: vi.fn() }));
const client = new StudioClient();
const state = {
  ...client.getSnapshot(),
  status: "connected" as const,
  studio: true,
  scenes: ["Starting", "Camera", "Slides"],
  program: "Starting",
  preview: "Camera",
  transitions: ["Cut", "Fade"],
  currentTransition: "Fade",
  duration: 300,
};
const app = () => (
  <MemoryRouter>
    <Studio />
  </MemoryRouter>
);
beforeEach(() => {
  // jsdom has no layout observer; Radix Scroll Area uses it for scrollbar sizing.
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  localStorage.clear();
  vi.mocked(useStudio).mockReturnValue({ client, ...state });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("selects a transition without taking Program, then triggers the selected transition explicitly", async () => {
  const user = userEvent.setup();
  const select = vi
    .spyOn(client, "selectTransition")
    .mockResolvedValue(undefined);
  const transition = vi
    .spyOn(client, "transition")
    .mockResolvedValue(undefined);
  const { rerender } = render(app());
  const trigger = screen.getByRole("button", { name: "Select transition" });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  expect(
    await screen.findByRole("menuitemradio", { name: "Fade" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(document.body).not.toHaveAttribute("data-scroll-locked");
  await user.click(screen.getByRole("menuitemradio", { name: "Cut" }));
  expect(select).toHaveBeenCalledExactlyOnceWith("Cut");
  expect(transition).not.toHaveBeenCalled();
  vi.mocked(useStudio).mockReturnValue({
    client,
    ...state,
    currentTransition: "Cut",
  });
  rerender(app());
  expect(
    screen.getByRole("button", { name: "Select transition" }),
  ).toHaveTextContent("Cut");
  await user.click(
    screen.getByRole("button", { name: "Transition", exact: true }),
  );
  expect(transition).toHaveBeenCalledExactlyOnceWith("Cut");
});
it("selects scenes for Preview and shows independent Preview and Program indicators", async () => {
  const select = vi.spyOn(client, "selectScene").mockResolvedValue(undefined);
  const { rerender } = render(app());
  let grid = within(screen.getByRole("region", { name: "Scenes" }));
  expect(grid.getByRole("button", { name: "Camera Preview" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    grid.getByRole("button", { name: "Starting Program" }),
  ).toHaveAttribute("aria-pressed", "false");
  await userEvent.setup().click(grid.getByRole("button", { name: "Slides" }));
  expect(select).toHaveBeenCalledExactlyOnceWith("Slides");
  vi.mocked(useStudio).mockReturnValue({
    client,
    ...state,
    preview: "Starting",
  });
  rerender(app());
  grid = within(screen.getByRole("region", { name: "Scenes" }));
  expect(
    grid.getByRole("button", { name: "Starting Preview Program" }),
  ).toHaveAttribute("aria-pressed", "true");
});
it("shows the video indicator only on scenes containing media, alongside selection labels", () => {
  vi.mocked(useStudio).mockReturnValue({ client, ...state, mediaScenes: ["Camera"] });
  const { rerender } = render(app());
  const tile = screen.getByRole("button", { name: "Camera Preview" });
  expect(within(tile).getByLabelText("Contains media source")).toHaveClass("right-2", "bottom-2");
  expect(within(tile).getByText("Preview")).toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: "Slides" })).queryByLabelText("Contains media source")).not.toBeInTheDocument();
  vi.mocked(useStudio).mockReturnValue({ client, ...state, mediaScenes: [] });
  rerender(app());
  expect(screen.queryByLabelText("Contains media source")).not.toBeInTheDocument();
});
it("shows image and video indicators together only on matching scenes", () => {
  vi.mocked(useStudio).mockReturnValue({ client, ...state, imageScenes: ["Camera", "Slides"], mediaScenes: ["Camera"] });
  const { rerender } = render(app());
  const camera = within(screen.getByRole("button", { name: "Camera Preview" }));
  expect(camera.getByLabelText("Contains image source")).toHaveClass("right-2", "bottom-2");
  expect(camera.getByLabelText("Contains media source")).toHaveClass("right-7");
  const slides = within(screen.getByRole("button", { name: "Slides" }));
  expect(slides.getByLabelText("Contains image source")).toBeInTheDocument();
  expect(slides.queryByLabelText("Contains media source")).not.toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: "Starting Program" })).queryByLabelText("Contains image source")).not.toBeInTheDocument();
  vi.mocked(useStudio).mockReturnValue({ client, ...state });
  rerender(app());
  expect(screen.queryByLabelText("Contains image source")).not.toBeInTheDocument();
});
it("blocks scene selection and both transition actions while busy", () => {
  vi.mocked(useStudio).mockReturnValue({ client, ...state, busy: true });
  render(app());
  expect(screen.getByRole("button", { name: "Transition" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(
    screen.getByRole("button", { name: "Select transition" }),
  ).toHaveAttribute("aria-disabled", "true");
  within(screen.getByRole("region", { name: "Scenes" }))
    .getAllByRole("button")
    .forEach((button) =>
      expect(button).toHaveAttribute("aria-disabled", "true"),
    );
});

it("toggles both previews together and stays synchronized with individual settings", async () => {
  const user = userEvent.setup();
  const { unmount } = render(app());
  await user.click(screen.getByRole("button", { name: "Show Previews" }));
  expect(screen.getByRole("button", { name: "Hide Previews" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (const kind of ["preview", "program"] as const) {
    expect(localStorage.getItem(monitorSettingsKey("default", kind))).toBe(
      "obs",
    );
  }
  screen.getByRole("button", { name: "Program settings" }).focus();
  await user.keyboard("{ArrowDown}");
  expect(
    screen.getByRole("menuitemradio", { name: "OBS Preview" }),
  ).toHaveAttribute("aria-checked", "true");
  await user.click(screen.getByRole("menuitemradio", { name: "No Preview" }));
  expect(screen.getByRole("button", { name: "Show Previews" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(localStorage.getItem(monitorSettingsKey("default", "preview"))).toBe(
    "obs",
  );
  expect(localStorage.getItem(monitorSettingsKey("default", "program"))).toBe(
    "none",
  );
  await user.click(screen.getByRole("button", { name: "Show Previews" }));
  unmount();
  render(app());
  await user.click(screen.getByRole("button", { name: "Hide Previews" }));
  for (const kind of ["preview", "program"] as const) {
    expect(localStorage.getItem(monitorSettingsKey("default", kind))).toBe(
      "none",
    );
  }
});

it("applies valid duration edits on blur or Enter and refreshes from OBS", async () => {
  const user = userEvent.setup();
  const save = vi
    .spyOn(client, "setTransitionDuration")
    .mockResolvedValue(undefined);
  const { rerender } = render(app());
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Select transition" }));
  expect(screen.getByRole("separator")).toBeInTheDocument();
  const input = screen.getByRole("spinbutton", {
    name: "Transition duration (milliseconds)",
  });
  expect(input).toHaveValue(300);
  await user.clear(input);
  await user.type(input, "750");
  await user.keyboard("{Enter}");
  expect(save).toHaveBeenCalledExactlyOnceWith(750);
  vi.mocked(useStudio).mockReturnValue({ client, ...state, duration: 1200 });
  rerender(app());
  expect(screen.getByRole("spinbutton")).toHaveValue(1200);
  expect(screen.getByRole("spinbutton")).toBe(input);
  await user.clear(input);
  await user.type(input, "1500");
  await user.click(screen.getByRole("separator"));
  expect(save).toHaveBeenLastCalledWith(1500);
  await user.clear(screen.getByRole("spinbutton"));
  await user.type(screen.getByRole("spinbutton"), "49");
  await user.keyboard("{Enter}");
  expect(save).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("alert")).toHaveTextContent("50–20,000 ms");
});
it("hides the duration summary and editor for fixed transitions", async () => {
  vi.mocked(useStudio).mockReturnValue({ client, ...state, duration: null });
  render(app());
  await userEvent.setup().click(screen.getByRole("button", { name: "Select transition" }));
  expect(screen.queryByText("Fixed")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Select transition" })).not.toHaveTextContent("ms");
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.queryByRole("separator")).not.toBeInTheDocument();
});

it("keeps controls mounted and visually enabled during background refresh while blocking actions", async () => {
  const user = userEvent.setup();
  const select = vi.spyOn(client, "selectScene").mockResolvedValue(undefined);
  const take = vi.spyOn(client, "transition").mockResolvedValue(undefined);
  const { rerender } = render(app());
  const transition = screen.getByRole("button", { name: "Transition" });
  const scene = screen.getByRole("button", { name: "Camera Preview" });
  await user.click(screen.getByRole("button", { name: "Select transition" }));
  vi.mocked(useStudio).mockReturnValue({ client, ...state, syncing: true });
  rerender(app());
  expect(screen.getByRole("button", { name: "Transition" })).toBe(transition);
  expect(screen.getByRole("button", { name: "Camera Preview" })).toBe(scene);
  expect(transition).not.toBeDisabled();
  expect(scene).not.toBeDisabled();
  expect(transition).toHaveAttribute("aria-disabled", "true");
  expect(scene).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("spinbutton")).toHaveAttribute("readonly");
  await user.keyboard("{Escape}");
  await user.click(transition);
  await user.click(scene);
  expect(select).not.toHaveBeenCalled();
  expect(take).not.toHaveBeenCalled();
  screen.getByRole("button", { name: "Select transition" }).focus();
  await user.keyboard("{ArrowDown}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("opens scene actions without selecting Preview and generates only the requested scene", async () => {
  const select = vi.spyOn(client, "selectScene").mockResolvedValue(undefined);
  const generate = vi.spyOn(client, "generatePreviews").mockResolvedValue(undefined);
  render(app());
  fireEvent.contextMenu(screen.getByRole("button", { name: "Slides" }));
  expect(select).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole("menuitem", { name: "Generate preview" }));
  expect(generate).toHaveBeenCalledExactlyOnceWith("Slides");
});
it("resets only the scene chosen in the context menu without selecting Preview", async () => {
  const select = vi.spyOn(client, "selectScene").mockResolvedValue(undefined);
  const reset = vi.spyOn(client, "resetPreviews").mockResolvedValue(undefined);
  render(app());
  fireEvent.contextMenu(screen.getByRole("button", { name: "Slides" }));
  await userEvent.setup().click(screen.getByRole("menuitem", { name: "Reset preview" }));
  expect(reset).toHaveBeenCalledExactlyOnceWith("Slides");
  expect(select).not.toHaveBeenCalled();
});
it.each(["busy", "syncing"])("disables the scene reset action while %s", async (flag) => {
  const reset = vi.spyOn(client, "resetPreviews").mockResolvedValue(undefined);
  vi.mocked(useStudio).mockReturnValue({ client, ...state, [flag]: true });
  render(app());
  fireEvent.contextMenu(screen.getByRole("button", { name: "Slides" }));
  const item = screen.getByRole("menuitem", { name: "Reset preview" });
  expect(item).toHaveAttribute("data-disabled");
  await userEvent.setup().click(item);
  expect(reset).not.toHaveBeenCalled();
});
it("filters hidden scenes, marks them when revealed, and allows restoring them", async () => {
  const hide = vi.spyOn(client, "setSceneHidden");
  vi.mocked(useStudio).mockReturnValue({ client, ...state, hiddenScenes: ["Slides"] });
  const { rerender } = render(app());
  expect(screen.queryByRole("button", { name: "Slides Hidden" })).not.toBeInTheDocument();
  vi.mocked(useStudio).mockReturnValue({ client, ...state, hiddenScenes: ["Slides"], showHiddenScenes: true });
  rerender(app());
  const tile = screen.getByRole("button", { name: "Slides Hidden" });
  expect(within(tile).getByLabelText("Hidden scene")).toBeInTheDocument();
  fireEvent.contextMenu(tile);
  await userEvent.setup().click(screen.getByRole("menuitem", { name: "Show scene" }));
  expect(hide).toHaveBeenCalledExactlyOnceWith("Slides", false);
});
it("opens actions on touch long press without selecting the scene", async () => {
  vi.useFakeTimers();
  const select = vi.spyOn(client, "selectScene").mockResolvedValue(undefined);
  render(app());
  const tile = screen.getByRole("button", { name: "Slides" });
  const pointer = new Event("pointerdown", { bubbles: true });
  Object.assign(pointer, { pointerType: "touch", clientX: 20, clientY: 20 });
  fireEvent(tile, pointer);
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(screen.getByRole("menuitem", { name: "Hide scene" })).toBeInTheDocument();
  fireEvent.click(tile);
  expect(select).not.toHaveBeenCalled();
  vi.useRealTimers();
});
