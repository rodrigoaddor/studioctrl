// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "../src/App";
import { StudioProvider, useStudio } from "../src/context";
import { StudioClient } from "../src/lib/obs";
import { saveProfiles } from "../src/lib/profiles";
import { loadActiveSession, rememberActiveSession } from "../src/lib/active-session";

const transport = vi.hoisted(() => ({ connect: vi.fn(), call: vi.fn(), disconnect: vi.fn(async () => {}) }));
vi.mock("obs-websocket-js/json", () => ({ default: class extends EventEmitter {
  connect = transport.connect;
  call = transport.call;
  disconnect = transport.disconnect;
} }));
vi.mock("../src/components/connection-status", () => ({ ConnectionStatus: () => null }));

const profile = { id: "1", name: "Studio", url: "ws://localhost:4455/", rememberPassword: true, password: "saved-password" };
const key = "studioctrl.active-session.v1";
function State() {
  const { status, restoring, client } = useStudio();
  return <><output>{restoring ? "restoring" : status}</output><button onClick={client.disconnect}>Exit test</button></>;
}
function Location() { return <output aria-label="Route">{useLocation().pathname}</output>; }
function app(path = "/studio") {
  return <StrictMode><MemoryRouter initialEntries={[path]}><StudioProvider><App /><Location /></StudioProvider></MemoryRouter></StrictMode>;
}
function seed() { saveProfiles([profile]); rememberActiveSession(profile); }
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  transport.connect.mockReset().mockResolvedValue({});
  transport.disconnect.mockClear();
  transport.call.mockReset().mockImplementation(async (request: string) => {
    switch (request) {
      case "GetStudioModeEnabled": return { studioModeEnabled: false };
      case "GetSceneList": return { scenes: [], currentProgramSceneName: "Live" };
      case "GetSceneTransitionList": return { transitions: [] };
      case "GetCurrentSceneTransition": return { transitionName: "Cut", transitionKind: "cut_transition", transitionFixed: true };
      case "GetSceneCollectionList": return { currentSceneCollectionName: "Main" };
      case "GetStreamStatus": case "GetRecordStatus": return { outputActive: false, outputDuration: 0 };
      default: throw new Error(`Unexpected request: ${request}`);
    }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("reattempts the active connection once after reload, including StrictMode, and keeps the studio route", async () => {
  seed();
  render(app());
  await screen.findByRole("heading", { name: "Studio Mode is disabled" });
  expect(transport.connect).toHaveBeenCalledExactlyOnceWith(profile.url, profile.password, { rpcVersion: 1 });
  expect(screen.getByLabelText("Route")).toHaveTextContent("/studio");
  expect(sessionStorage.getItem(key)).toBe(JSON.stringify({ id: profile.id, url: profile.url }));
  expect(transport.call.mock.calls.every(([request]) => request.startsWith("Get"))).toBe(true);
});
it("returns to the studio when the restored tab starts at the home route", async () => {
  seed(); render(app("/"));
  await screen.findByRole("heading", { name: "Studio Mode is disabled" });
  expect(screen.getByLabelText("Route")).toHaveTextContent("/studio");
});
it("shows reconnection instead of the home page while a connection is pending", async () => {
  seed(); transport.connect.mockReturnValue(new Promise(() => {}));
  render(app());
  expect(screen.getByText(/Reconnecting to Studio/)).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Connections" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel", exact: true })).toBeInTheDocument();
});
it("falls back home after authentication failure and does not retry on the next reload", async () => {
  seed(); transport.connect.mockRejectedValue(new Error("Authentication failed"));
  const view = render(app());
  await screen.findByRole("heading", { name: "Connections" });
  expect(screen.getByLabelText("Route")).toHaveTextContent(/^\/$/);
  expect(sessionStorage.getItem(key)).toBeNull();
  view.unmount(); render(app());
  await screen.findByRole("heading", { name: "Connections" });
  expect(transport.connect).toHaveBeenCalledTimes(1);
});
it("falls back home when initial OBS synchronization fails", async () => {
  seed(); transport.call.mockRejectedValue(new Error("OBS read failed"));
  render(app());
  await screen.findByRole("heading", { name: "Connections" });
  expect(sessionStorage.getItem(key)).toBeNull();
});
it("bounds a stalled connection to ten seconds and ignores a late success", async () => {
  vi.useFakeTimers(); seed();
  let resolve!: (value: object) => void;
  transport.connect.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(app());
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(screen.getByRole("heading", { name: "Connections" })).toBeInTheDocument();
  expect(sessionStorage.getItem(key)).toBeNull();
  await act(async () => { resolve({}); });
  expect(screen.getByLabelText("Route")).toHaveTextContent(/^\/$/);
});
it("cancels restoration without a late result changing the route", async () => {
  seed(); let resolve!: (value: object) => void;
  transport.connect.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(app());
  await userEvent.setup().click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByRole("heading", { name: "Connections" })).toBeInTheDocument();
  await act(async () => { resolve({}); });
  expect(screen.getByLabelText("Route")).toHaveTextContent(/^\/$/);
  expect(sessionStorage.getItem(key)).toBeNull();
});
it("clears the recovery marker on Exit", async () => {
  seed(); render(app());
  await screen.findByRole("heading", { name: "Studio Mode is disabled" });
  await userEvent.setup().click(screen.getByRole("button", { name: "Exit", exact: true }));
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(screen.getByRole("heading", { name: "Connections" })).toBeInTheDocument();
});
it("does not let a cancelled restoration time out or overwrite a later manual connection", async () => {
  vi.useFakeTimers();
  seed(); let resolve!: (value: object) => void;
  transport.connect.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  render(app());
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: `Connect to ${profile.name}`, exact: true })); });
  expect(screen.getByRole("heading", { name: "Studio Mode is disabled" })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); resolve({}); });
  expect(screen.getByRole("heading", { name: "Studio Mode is disabled" })).toBeInTheDocument();
  expect(screen.getByLabelText("Route")).toHaveTextContent("/studio");
  expect(loadActiveSession()?.id).toBe(profile.id);
});
it("never persists or restores unremembered credentials", async () => {
  const unsaved = { ...profile, rememberPassword: false, password: "transient-secret" };
  saveProfiles([unsaved]);
  const client = new StudioClient();
  await client.connect(unsaved, unsaved.password);
  expect(sessionStorage.getItem(key)).not.toContain("transient-secret");
  transport.connect.mockClear();
  render(<StudioProvider><State /></StudioProvider>);
  await waitFor(() => expect(transport.connect).toHaveBeenCalledOnce());
  expect(transport.connect).toHaveBeenCalledWith(profile.url, undefined, { rpcVersion: 1 });
});
it("ignores missing, removed, edited, or malformed profiles", () => {
  for (const value of ["{broken", "null", "[]", JSON.stringify({ id: "missing", url: profile.url }), JSON.stringify({ id: profile.id, url: "ws://other:4455/" })]) {
    saveProfiles([profile]); sessionStorage.setItem(key, value);
    expect(loadActiveSession()).toBeNull();
  }
  sessionStorage.clear(); render(app());
  expect(transport.connect).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Connections" })).toBeInTheDocument();
});
it("keeps manual connections usable when session storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Unavailable"); });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Unavailable"); });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Unavailable"); });
  expect(loadActiveSession()).toBeNull();
  const client = new StudioClient();
  await client.connect(profile, profile.password);
  expect(client.getSnapshot().status).toBe("connected");
  client.disconnect();
  expect(client.getSnapshot().status).toBe("disconnected");
});
