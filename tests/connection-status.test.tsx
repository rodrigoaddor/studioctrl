// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ConnectionStatus } from "../src/components/connection-status";
import { isObsOnline } from "../src/lib/reachability";
vi.mock("../src/lib/reachability", () => ({ isObsOnline: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(isObsOnline).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("refreshes reachability periodically and cancels on unmount", async () => {
  vi.mocked(isObsOnline).mockResolvedValueOnce(true).mockResolvedValue(false);
  const { unmount } = render(
    <ConnectionStatus url="ws://studio:4455" name="Studio" />,
  );
  expect(
    screen.getByRole("status", { name: "Studio: Checking…" }),
  ).toBeInTheDocument();
  await act(async () => {});
  expect(
    screen.getByRole("status", { name: "Studio: Online" }),
  ).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(
    screen.getByRole("status", { name: "Studio: Offline" }),
  ).toBeInTheDocument();
  const signal = vi.mocked(isObsOnline).mock.calls[0][1];
  unmount();
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("discards a pending result for an edited URL", async () => {
  let resolveOld!: (online: boolean) => void;
  vi.mocked(isObsOnline)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValue(false);
  const { rerender } = render(
    <ConnectionStatus url="ws://old:4455" name="Studio" />,
  );
  const oldSignal = vi.mocked(isObsOnline).mock.calls[0][1];
  rerender(<ConnectionStatus url="ws://new:4455" name="Studio" />);
  await act(async () => {
    resolveOld(true);
  });
  expect(oldSignal.aborted).toBe(true);
  expect(
    screen.getByRole("status", { name: "Studio: Offline" }),
  ).toBeInTheDocument();
});
