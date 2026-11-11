import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { createHash } from "node:crypto";
import { StudioClient } from "../src/lib/obs";

const hash = (s: string) => createHash("sha256").update(s).digest("base64");
let server: WebSocketServer;
let client: StudioClient;
let socket: WebSocket;
let studio: boolean;
let preview: string;
let program: string;
let transition: string;
let rejectTrigger: boolean;
let deferVideoEnd: boolean;
let requests: string[];
let url: string;
function event(eventType: string, eventData = {}) {
  socket.send(
    JSON.stringify({ op: 5, d: { eventType, eventIntent: 1, eventData } }),
  );
}
beforeEach(async () => {
  studio = false;
  preview = "Camera";
  program = "Starting";
  transition = "Fade";
  rejectTrigger = false;
  deferVideoEnd = false;
  requests = [];
  server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  if (typeof address !== "object" || !address)
    throw new Error("No test server");
  url = `ws://127.0.0.1:${address.port}`;
  server.on("connection", (ws) => {
    socket = ws;
    ws.send(
      JSON.stringify({
        op: 0,
        d: {
          obsWebSocketVersion: "5.0.0",
          rpcVersion: 1,
          authentication: { salt: "salt", challenge: "challenge" },
        },
      }),
    );
    ws.on("message", (bytes) => {
      const { op, d } = JSON.parse(String(bytes));
      if (op === 1) {
        if (
          d.authentication !== hash(hash("test-passwordsalt") + "challenge")
        ) {
          ws.close(4009, "Authentication failed");
          return;
        }
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        return;
      }
      if (op !== 6) return;
      requests.push(d.requestType);
      let responseData: object = {};
      let result = true;
      switch (d.requestType) {
        case "GetStudioModeEnabled":
          responseData = { studioModeEnabled: studio };
          break;
        case "GetSceneList":
          responseData = {
            currentProgramSceneName: program,
            currentPreviewSceneName: studio ? preview : null,
            scenes: ["Starting", "Camera", "Slides"].map(
              (sceneName, sceneIndex) => ({ sceneName, sceneIndex }),
            ),
          };
          break;
        case "GetSceneTransitionList":
          responseData = {
            currentSceneTransitionName: transition,
            transitions: ["Cut", "Fade"].map((transitionName) => ({
              transitionName,
            })),
          };
          break;
        case "GetCurrentSceneTransition":
          responseData = {
            transitionName: transition,
            transitionFixed: false,
            transitionDuration: 300,
          };
          break;
        case "GetCurrentPreviewScene":
          responseData = { sceneName: preview };
          break;
        case "SetStudioModeEnabled":
          studio = true;
          event("StudioModeStateChanged", { studioModeEnabled: true });
          break;
        case "SetCurrentPreviewScene":
          preview = d.requestData.sceneName;
          event("CurrentPreviewSceneChanged", { sceneName: preview });
          break;
        case "SetCurrentSceneTransition":
          transition = d.requestData.transitionName;
          event("CurrentSceneTransitionChanged", {
            transitionName: transition,
          });
          break;
        case "TriggerStudioModeTransition":
          if (rejectTrigger) {
            result = false;
            break;
          }
          event("SceneTransitionStarted");
          [program, preview] = [preview, program];
          event("CurrentProgramSceneChanged", { sceneName: program });
          event("CurrentPreviewSceneChanged", { sceneName: preview });
          event("SceneTransitionEnded");
          if (!deferVideoEnd) event("SceneTransitionVideoEnded");
          break;
      }
      ws.send(
        JSON.stringify({
          op: 7,
          d: {
            requestId: d.requestId,
            requestType: d.requestType,
            requestStatus: {
              result,
              code: result ? 100 : 500,
              comment: result ? undefined : "Transition failed",
            },
            responseData,
          },
        }),
      );
    });
  });
  client = new StudioClient();
});
afterEach(async () => {
  client.disconnect();
  server.clients.forEach((ws) => ws.terminate());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function connect(password = "test-password") {
  await client.connect(
    { id: "test", name: "Test OBS", url, rememberPassword: false },
    password,
  );
}
describe("OBS v5 integration", () => {
  it("authenticates, gates controls on Studio Mode, then selects only Preview", async () => {
    await connect();
    expect(client.getSnapshot()).toMatchObject({
      status: "connected",
      studio: false,
      program: "Starting",
      preview: null,
    });
    await client.selectScene("Slides");
    expect(requests).not.toContain("SetCurrentPreviewScene");
    await client.enableStudio();
    await client.selectScene("Slides");
    expect(client.getSnapshot()).toMatchObject({
      studio: true,
      preview: "Slides",
      program: "Starting",
      busy: false,
    });
    expect(requests).not.toContain("SetCurrentProgramScene");
  });
  it("selects the requested transition before triggering and reflects a scene swap", async () => {
    await connect();
    await client.enableStudio();
    await client.transition("Cut");
    expect(requests.indexOf("SetCurrentSceneTransition")).toBeLessThan(
      requests.indexOf("TriggerStudioModeTransition"),
    );
    expect(client.getSnapshot()).toMatchObject({
      program: "Camera",
      preview: "Starting",
      currentTransition: "Cut",
      busy: false,
    });
  });
  it("follows external scene and studio mode changes", async () => {
    await connect();
    await client.enableStudio();
    program = "Slides";
    event("CurrentProgramSceneChanged", { sceneName: program });
    await expect.poll(() => client.getSnapshot().program).toBe("Slides");
    studio = false;
    event("StudioModeStateChanged", { studioModeEnabled: false });
    await expect.poll(() => client.getSnapshot().studio).toBe(false);
    expect(client.getSnapshot().preview).toBeNull();
  });
  it("reports authentication failure and allows reconnecting", async () => {
    await connect("wrong");
    expect(client.getSnapshot().status).toBe("disconnected");
    expect(client.getSnapshot().error).toContain("Authentication failed");
    await connect();
    expect(client.getSnapshot().status).toBe("connected");
  });
  it("unlocks controls when a transition request fails", async () => {
    await connect();
    await client.enableStudio();
    rejectTrigger = true;
    await client.transition("Fade");
    expect(client.getSnapshot()).toMatchObject({
      busy: false,
      error: "Transition failed",
      program: "Starting",
    });
  });
  it("clears stale scene state after the connection drops", async () => {
    await connect();
    await client.enableStudio();
    socket.close(1001, "OBS stopped");
    await expect.poll(() => client.getSnapshot().status).toBe("disconnected");
    expect(client.getSnapshot()).toMatchObject({
      scenes: [],
      preview: null,
      program: null,
      busy: false,
    });
  });
});

it("keeps controls locked through stinger playback after its cut point", async () => {
  await connect();
  await client.enableStudio();
  deferVideoEnd = true;
  await client.transition("Fade");
  expect(client.getSnapshot().busy).toBe(true);
  const before = requests.length;
  await client.selectScene("Slides");
  expect(requests.length).toBe(before);
  event("SceneTransitionVideoEnded");
  await expect.poll(() => client.getSnapshot().busy).toBe(false);
});
