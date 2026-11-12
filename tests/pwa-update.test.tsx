// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PwaUpdate } from "../src/components/pwa-update";
import { useStudio } from "../src/context";
import { StudioClient } from "../src/lib/obs";

const pwa = vi.hoisted(() => ({
  needRefresh: true,
  dismiss: vi.fn(),
  update: vi.fn(),
}));
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [pwa.needRefresh, pwa.dismiss],
    updateServiceWorker: pwa.update,
  }),
}));
vi.mock("../src/context", () => ({ useStudio: vi.fn() }));
const client = new StudioClient();

beforeEach(() => {
  vi.clearAllMocks();
  pwa.needRefresh = true;
  pwa.update.mockResolvedValue(undefined);
  vi.mocked(useStudio).mockReturnValue({ client, ...client.getSnapshot() });
});
afterEach(cleanup);

it("waits for an explicit reload and allows postponing an update", async () => {
  render(<PwaUpdate />);
  expect(pwa.update).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Later" }));
  expect(pwa.dismiss).toHaveBeenCalledWith(false);
  expect(pwa.update).not.toHaveBeenCalled();
});

it.each(["connecting", "connected"] as const)("blocks updates while %s", async (status) => {
  vi.mocked(useStudio).mockReturnValue({ client, ...client.getSnapshot(), status });
  render(<PwaUpdate />);
  const reload = screen.getByRole("button", { name: "Reload to update" });
  expect(reload).toBeDisabled();
  await userEvent.click(reload);
  expect(pwa.update).not.toHaveBeenCalled();
});

it("applies an update only after the disconnected operator clicks reload", async () => {
  render(<PwaUpdate />);
  await userEvent.click(screen.getByRole("button", { name: "Reload to update" }));
  expect(pwa.update).toHaveBeenCalledOnce();
});

it("reports update failures and allows retry", async () => {
  pwa.update.mockRejectedValueOnce(new Error("Unavailable"));
  render(<PwaUpdate />);
  await userEvent.click(screen.getByRole("button", { name: "Reload to update" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Update failed");
  expect(screen.getByRole("button", { name: "Reload to update" })).toBeEnabled();
});

it("does not show a notice without a waiting update", () => {
  pwa.needRefresh = false;
  render(<PwaUpdate />);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
});
