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
let transitionDuration: number;
let transitionFixed: boolean;
let rejectTrigger: boolean;
let deferVideoEnd: boolean;
let requests: string[];
let screenshotParams: unknown;
let holdScreenshots: boolean;
let sceneList: { sceneName: string; sceneIndex: number }[];
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
  transitionDuration = 300;
  transitionFixed = false;
  rejectTrigger = false;
  deferVideoEnd = false;
  requests = [];
  screenshotParams = undefined;
  holdScreenshots = false;
  // OBS sends its Scenes dock bottom-to-top, with the top scene at the highest index.
  sceneList = ["Slides", "Camera", "Starting"].map((sceneName, sceneIndex) => ({
    sceneName,
    sceneIndex,
  }));
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
        case "GetSourceScreenshot":
          screenshotParams = d.requestData;
          if (holdScreenshots) return;
          responseData = { imageData: "data:image/jpeg;base64,frame" };
          break;
        case "GetStudioModeEnabled":
          responseData = { studioModeEnabled: studio };
          break;
        case "GetSceneList":
          responseData = {
            currentProgramSceneName: program,
            currentPreviewSceneName: studio ? preview : null,
            scenes: sceneList,
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
            transitionFixed,
            transitionDuration,
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
        case "SetCurrentSceneTransitionDuration":
          transitionDuration = d.requestData.transitionDuration;
          event("CurrentSceneTransitionDurationChanged", {
            transitionDuration,
          });
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

it("changes the selected transition without triggering a scene transition", async () => {
  await connect();
  await client.selectTransition("Cut");
  expect(requests).not.toContain("SetCurrentSceneTransition");
  await client.enableStudio();
  await client.selectTransition("Cut");
  expect(client.getSnapshot()).toMatchObject({
    currentTransition: "Cut",
    program: "Starting",
    preview: "Camera",
    busy: false,
  });
  expect(requests).not.toContain("TriggerStudioModeTransition");
});

it("matches OBS Scenes dock order on connection", async () => {
  await connect();
  expect(client.getSnapshot().scenes).toEqual(["Starting", "Camera", "Slides"]);
});

it("follows reordered OBS scenes after SceneListChanged", async () => {
  await connect();
  sceneList = [
    { sceneName: "Camera", sceneIndex: 0 },
    { sceneName: "Starting", sceneIndex: 1 },
    { sceneName: "Slides", sceneIndex: 2 },
  ];
  event("SceneListChanged", { scenes: sceneList });
  await expect
    .poll(() => client.getSnapshot().scenes)
    .toEqual(["Slides", "Starting", "Camera"]);
});

it("uses bounded JPEG screenshots without locking controls and shares concurrent reads", async () => {
  await connect();
  await client.enableStudio();
  const first = client.getScreenshot("Camera");
  const second = client.getScreenshot("Camera");
  expect(first).toBe(second);
  expect(client.getSnapshot().busy).toBe(false);
  expect(await first).toBe("data:image/jpeg;base64,frame");
  expect(screenshotParams).toEqual({
    sourceName: "Camera",
    imageFormat: "jpg",
    imageWidth: 640,
    imageCompressionQuality: 65,
  });
  expect(requests.filter((r) => r === "GetSourceScreenshot")).toHaveLength(1);
  expect(client.getSnapshot().error).toBeNull();
});
it("caps in-flight screenshot requests and releases them on disconnect", async () => {
  await connect();
  await client.enableStudio();
  holdScreenshots = true;
  const first = client.getScreenshot("Camera");
  const second = client.getScreenshot("Starting");
  const settled = Promise.allSettled([first, second]);
  await expect(client.getScreenshot("Slides")).rejects.toThrow("busy");
  client.disconnect();
  await settled;
  await expect(client.getScreenshot("Camera")).rejects.toThrow("unavailable");
});

it("invalidates pending frames when a collection changes, even if the scene name is reused", async () => {
  await connect();
  await client.enableStudio();
  holdScreenshots = true;
  const epoch = client.getSnapshot().previewEpoch;
  const pending = client.getScreenshot("Camera");
  const rejection = expect(pending).rejects.toThrow("session changed");
  event("CurrentSceneCollectionChanging");
  await rejection;
  expect(client.getSnapshot().previewEpoch).toBe(epoch + 1);
  expect(client.getSnapshot().preview).toBeNull();
  holdScreenshots = false;
  event("CurrentSceneCollectionChanged");
  await expect.poll(() => client.getSnapshot().syncing).toBe(false);
  expect(await client.getScreenshot("Camera")).toBe(
    "data:image/jpeg;base64,frame",
  );
});

it("changes transition duration without taking Program and follows external duration changes", async () => {
  await connect();
  await client.enableStudio();
  await client.setTransitionDuration(750);
  expect(client.getSnapshot()).toMatchObject({
    duration: 750,
    program: "Starting",
    preview: "Camera",
    busy: false,
  });
  expect(requests).not.toContain("TriggerStudioModeTransition");
  transitionDuration = 1200;
  event("CurrentSceneTransitionDurationChanged", { transitionDuration });
  await expect.poll(() => client.getSnapshot().duration).toBe(1200);
});
it("rejects out-of-range or fractional durations without sending them to OBS", async () => {
  await connect();
  await client.enableStudio();
  for (const value of [49, 20001, 100.5, NaN])
    await client.setTransitionDuration(value);
  expect(requests).not.toContain("SetCurrentSceneTransitionDuration");
  expect(client.getSnapshot()).toMatchObject({ duration: 300, busy: false });
  expect(client.getSnapshot().error).toContain("50 to 20,000");
});
it("leaves fixed-duration transitions unchanged", async () => {
  transitionFixed = true;
  await connect();
  await client.enableStudio();
  await client.setTransitionDuration(750);
  expect(client.getSnapshot().duration).toBeNull();
  expect(requests).not.toContain("SetCurrentSceneTransitionDuration");
});
