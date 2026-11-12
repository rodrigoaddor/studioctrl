// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Studio } from "../src/pages/studio";
import { useStudio } from "../src/context";
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
  vi.mocked(useStudio).mockReturnValue({ client, ...state });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
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
  await user.click(screen.getByRole("menuitemradio", { name: "Cut" }));
  expect(select).toHaveBeenCalledExactlyOnceWith("Cut");
  expect(transition).not.toHaveBeenCalled();
  vi.mocked(useStudio).mockReturnValue({
    client,
    ...state,
    currentTransition: "Cut",
  });
  rerender(app());
  await user.click(screen.getByRole("button", { name: "Transition with Cut" }));
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
it("blocks scene selection and both transition actions while busy", () => {
  vi.mocked(useStudio).mockReturnValue({ client, ...state, busy: true });
  render(app());
  expect(
    screen.getByRole("button", { name: "Transition with Fade" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Select transition" }),
  ).toBeDisabled();
  within(screen.getByRole("region", { name: "Scenes" }))
    .getAllByRole("button")
    .forEach((button) => expect(button).toBeDisabled());
});
