// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { StudioProvider } from "../src/context";

const qr = vi.hoisted(() => ({
  decode: vi.fn<(result: { data: string }) => void>(),
  start: vi.fn(),
  pause: vi.fn(),
  destroy: vi.fn(),
  scanImage: vi.fn(),
}));
vi.mock("qr-scanner", () => ({
  default: class {
    constructor(_video: HTMLVideoElement, decode: typeof qr.decode) {
      qr.decode = decode;
    }
    start = qr.start;
    pause = qr.pause;
    destroy = qr.destroy;
    static scanImage = qr.scanImage;
  },
}));
vi.mock("../src/lib/reachability", () => ({
  isObsOnline: vi.fn().mockResolvedValue(false),
}));

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  qr.start.mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

async function openScanner() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <StudioProvider>
        <App />
      </StudioProvider>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "Add connection" }));
  await user.type(screen.getByLabelText("Connection name"), "Scanned studio");
  await user.click(screen.getByRole("button", { name: "Scan QR Code" }));
  return user;
}

it.each([false, true])(
  "fills QR credentials for review and persists only with explicit opt-in (%s)",
  async (remember) => {
    const user = await openScanner();
    act(() =>
      qr.decode({ data: "obsws://192.168.1.10:4455/secret%2Fpassword" }),
    );
    expect(screen.getByLabelText("WebSocket address")).toHaveValue(
      "ws://192.168.1.10:4455/",
    );
    expect(screen.getByLabelText("Saved password")).toHaveValue(
      "secret/password",
    );
    expect(screen.getByLabelText("Connection name")).toHaveValue(
      "Scanned studio",
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(localStorage.getItem("studioctrl.connections.v1")).toBeNull();
    expect(qr.pause).toHaveBeenCalledWith(true);
    expect(qr.destroy).toHaveBeenCalledOnce();
    if (remember) await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save connection" }));
    const [profile] = JSON.parse(
      localStorage.getItem("studioctrl.connections.v1")!,
    );
    expect(profile.url).toBe("ws://192.168.1.10:4455/");
    expect(profile.password).toBe(remember ? "secret/password" : undefined);
  },
);

it("rejects unrelated QR codes without modifying the form and allows another scan", async () => {
  await openScanner();
  act(() => qr.decode({ data: "https://example.com/private-password" }));
  expect(screen.getByLabelText("WebSocket address")).toHaveValue(
    "ws://localhost:4455",
  );
  expect(
    screen.getByText(
      "Scan an OBS connection QR code from WebSocket Server Settings.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/private-password/)).not.toBeInTheDocument();
  act(() => qr.decode({ data: "obsws://localhost:4455" }));
  expect(screen.getByLabelText("Saved password")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Scan QR Code" }),
  ).toBeInTheDocument();
});

it("allows image upload when camera access fails", async () => {
  qr.start.mockRejectedValue(new Error("Permission denied"));
  const user = await openScanner();
  expect(await screen.findByText(/Camera unavailable/)).toBeInTheDocument();
  qr.scanImage.mockResolvedValue({
    data: "obsws://backup:4455/image-password",
  });
  await user.upload(
    screen.getByLabelText("QR code image"),
    new File(["image"], "obs.png", { type: "image/png" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("WebSocket address")).toHaveValue(
      "ws://backup:4455/",
    ),
  );
  expect(screen.getByLabelText("Saved password")).toHaveValue("image-password");
});

it("stops the camera on cancellation and ignores pending image results", async () => {
  const user = await openScanner();
  let resolve!: (result: { data: string }) => void;
  qr.scanImage.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await user.upload(
    screen.getByLabelText("QR code image"),
    new File(["image"], "obs.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Cancel scan" }));
  expect(qr.pause).toHaveBeenCalledWith(true);
  expect(qr.destroy).toHaveBeenCalledOnce();
  await act(async () => resolve({ data: "obsws://stale:4455/password" }));
  expect(screen.getByLabelText("WebSocket address")).toHaveValue(
    "ws://localhost:4455",
  );
});

it("stops the camera when the connection dialog closes", async () => {
  const user = await openScanner();
  await user.click(screen.getByRole("button", { name: "Close", exact: true }));
  expect(qr.destroy).toHaveBeenCalledOnce();
  act(() => qr.decode({ data: "obsws://stale:4455/password" }));
  await user.click(screen.getByRole("button", { name: "Add connection" }));
  expect(screen.getByLabelText("Saved password")).toHaveValue("");
});
