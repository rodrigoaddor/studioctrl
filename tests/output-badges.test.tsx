// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OutputBadges } from "../src/components/output-badges";
import { useOutputStatuses } from "../src/hooks/use-output-statuses";
import { StudioClient, type OutputStatuses } from "../src/lib/obs";

let client: StudioClient;
const session = {};
function ObservedBadges({ activeSession = session }: { activeSession?: object | null }) {
  const { outputs } = useOutputStatuses(client, activeSession);
  return <OutputBadges outputs={outputs} />;
}
beforeEach(() => {
  vi.useFakeTimers();
  client = new StudioClient();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("shows existing output durations, updates them, and dims stopped outputs", async () => {
  const read = vi.spyOn(client, "getOutputStatuses").mockResolvedValue({
    stream: { active: true, duration: 3_661_999 },
    recording: { active: false, duration: 90_000 },
  });
  await act(async () => { render(<ObservedBadges />); });
  expect(screen.getByRole("status", { name: "LIVE: Active, 01:01:01" })).toHaveAttribute("data-active", "true");
  expect(screen.getByRole("status", { name: "REC: Inactive, 00:00:00" })).toHaveAttribute("data-active", "false");
  read.mockResolvedValue({
    stream: { active: false, duration: 0 },
    recording: { active: true, duration: 65_000, paused: true },
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole("status", { name: "LIVE: Inactive, 00:00:00" })).toHaveAttribute("data-active", "false");
  expect(screen.getByRole("status", { name: "REC: Paused, 00:01:05" })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole("status", { name: "REC: Paused, 00:01:05" })).toBeInTheDocument();
});

it("reports unavailable outputs independently and recovers on the next read", async () => {
  const read = vi.spyOn(client, "getOutputStatuses").mockResolvedValue({
    stream: null,
    recording: { active: true, duration: 12_000 },
  });
  await act(async () => { render(<ObservedBadges />); });
  expect(screen.getByRole("status", { name: "LIVE: Unavailable, --:--:--" })).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "REC: Active, 00:00:12" })).toBeInTheDocument();
  read.mockResolvedValue({
    stream: { active: true, duration: 5000, reconnecting: true },
    recording: { active: false, duration: 0 },
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole("status", { name: "LIVE: Reconnecting, 00:00:05" })).toBeInTheDocument();
});

it("serializes reads, suspends hidden tabs, and stops after unmount", async () => {
  let resolve!: (value: OutputStatuses) => void;
  const read = vi.spyOn(client, "getOutputStatuses").mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = render(<ObservedBadges />);
  expect(screen.getByRole("status", { name: "LIVE: Checking, --:--:--" })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(read).toHaveBeenCalledOnce();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => { resolve({ stream: null, recording: null }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(read).toHaveBeenCalledOnce();
  hidden.mockReturnValue(false);
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(read).toHaveBeenCalledTimes(2);
  view.unmount();
  await act(async () => { resolve({ stream: null, recording: null }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(read).toHaveBeenCalledTimes(2);
});

it("clears output state and discards obsolete reads across session changes", async () => {
  let resolve!: (value: OutputStatuses) => void;
  const read = vi.spyOn(client, "getOutputStatuses").mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
    .mockResolvedValue({ stream: { active: false, duration: 0 }, recording: { active: false, duration: 0 } });
  const view = render(<ObservedBadges />);
  const replacement = {};
  await act(async () => { view.rerender(<ObservedBadges activeSession={replacement} />); });
  expect(screen.getByRole("status", { name: "LIVE: Inactive, 00:00:00" })).toBeInTheDocument();
  await act(async () => { resolve({ stream: { active: true, duration: 60_000 }, recording: null }); });
  expect(screen.queryByRole("status", { name: "LIVE: Active, 00:01:00" })).not.toBeInTheDocument();
  view.rerender(<ObservedBadges activeSession={null} />);
  expect(screen.getByRole("status", { name: "LIVE: Checking, --:--:--" })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(read).toHaveBeenCalledTimes(2);
});
