import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { createHash } from "node:crypto";
import { StudioClient } from "../src/lib/obs";

import { usablePreview } from "../src/lib/scene-previews";
import { clearPreviews, readPreview, writePreview } from "../src/lib/preview-cache";
vi.mock("../src/lib/scene-previews", async (original) => ({
  ...(await original<typeof import("../src/lib/scene-previews")>()),
  usablePreview: vi.fn(async () => true),
}));
vi.mock("../src/lib/preview-cache", () => ({
  clearPreviews: vi.fn(async () => {}),
  readPreview: vi.fn(async () => undefined),
  writePreview: vi.fn(async () => {}),
}));
const hash = (s: string) => createHash("sha256").update(s).digest("base64");
let server: WebSocketServer;
let client: StudioClient;
let socket: WebSocket;
let studio: boolean;
let collectionName: string;
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
let mediaActive: boolean;
let mediaCursor: number;
let mediaDuration: number | null;
let mediaState: string;
let mediaInputSettings: Record<string, { inputKind: string; inputSettings: Record<string, unknown> }>;
let previewItems: Record<string, object[]>;
let groupItems: Record<string, object[]>;
let holdSceneItems: boolean;
let heldSceneReply: (() => void) | undefined;
let mediaActions: { inputName: string; mediaAction: string }[];
let rejectMediaAction: boolean;
let streamOutput: { outputActive: boolean; outputDuration: number; outputReconnecting: boolean };
let recordOutput: { outputActive: boolean; outputDuration: number; outputPaused: boolean };
let rejectStreamStatus: boolean;
let rejectOutputCommand: boolean;
let holdOutputStatus: boolean;
let heldOutputReplies: (() => void)[];
function event(eventType: string, eventData = {}) {
  socket.send(
    JSON.stringify({ op: 5, d: { eventType, eventIntent: 1, eventData } }),
  );
}
beforeEach(async () => {
  vi.mocked(usablePreview).mockResolvedValue(true);
  vi.mocked(readPreview).mockResolvedValue(undefined);
  vi.mocked(writePreview).mockClear();
  vi.mocked(clearPreviews).mockReset().mockResolvedValue(undefined);
  collectionName = "Collection A";
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
  mediaActive = true;
  mediaCursor = 5000;
  mediaDuration = 60000;
  mediaInputSettings = {};
  mediaState = "OBS_MEDIA_STATE_PLAYING";
  previewItems = {};
  groupItems = {};
  holdSceneItems = false;
  heldSceneReply = undefined;
  mediaActions = [];
  rejectMediaAction = false;
  streamOutput = { outputActive: true, outputDuration: 3_600_000, outputReconnecting: false };
  recordOutput = { outputActive: false, outputDuration: 0, outputPaused: false };
  rejectStreamStatus = false;
  rejectOutputCommand = false;
  holdOutputStatus = false;
  heldOutputReplies = [];
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
        case "StartStream":
        case "StopStream":
          result = !rejectOutputCommand;
          if (result) streamOutput.outputActive = d.requestType === "StartStream";
          break;
        case "StartRecord":
        case "StopRecord":
          result = !rejectOutputCommand;
          if (result) recordOutput.outputActive = d.requestType === "StartRecord";
          break;
        case "GetStreamStatus":
          result = !rejectStreamStatus;
          responseData = streamOutput;
          break;
        case "GetRecordStatus":
          responseData = recordOutput;
          break;
        case "GetInputList":
          responseData = { inputs: [
            { inputName: "Clip", inputKind: "ffmpeg_source", unversionedInputKind: "ffmpeg_source" },
            { inputName: "Hidden clip", inputKind: "vlc_source" },
            { inputName: "Camera", inputKind: "av_capture_input" },
          ] };
          break;
        case "GetSourceActive":
          responseData = { videoActive: mediaActive && (d.requestData.sourceName === "Clip"), videoShowing: true };
          break;
        case "GetSceneItemList":
          responseData = { sceneItems: previewItems[d.requestData.sceneName] ?? [] };
          break;
        case "GetGroupSceneItemList":
          responseData = { sceneItems: groupItems[d.requestData.sceneName] ?? [] };
          break;
        case "GetInputSettings":
          responseData = mediaInputSettings[d.requestData.inputName] ?? { inputKind: "ffmpeg_source", inputSettings: {} };
          break;
        case "GetMediaInputStatus":
          responseData = d.requestData.inputName === "Unavailable camera"
            ? { mediaState: "OBS_MEDIA_STATE_ENDED", mediaDuration: null, mediaCursor: null }
            : { mediaState, mediaDuration, mediaCursor };
          break;
        case "SetMediaInputCursor":
          mediaCursor = d.requestData.mediaCursor;
          break;
        case "TriggerMediaInputAction":
          mediaActions.push(d.requestData);
          if (rejectMediaAction) { result = false; break; }
          switch (d.requestData.mediaAction) {
            case "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY": mediaState = "OBS_MEDIA_STATE_PLAYING"; break;
            case "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE": mediaState = "OBS_MEDIA_STATE_PAUSED"; break;
            case "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP": mediaState = "OBS_MEDIA_STATE_STOPPED"; break;
            case "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART": mediaState = "OBS_MEDIA_STATE_PLAYING"; mediaCursor = 0; break;
          }
          break;
        case "GetSourceScreenshot":
          screenshotParams = d.requestData;
          if (holdScreenshots) return;
          responseData = { imageData: "data:image/jpeg;base64,frame" };
          break;
        case "GetSceneCollectionList":
          responseData = { currentSceneCollectionName: collectionName, sceneCollections: ["Collection A", "Collection B"] };
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
            transitionKind: transition === "Cut" ? "cut_transition" : transition === "Stinger" ? "stinger_transition" : "fade_transition",
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
          event("SceneTransitionStarted", { transitionName: transition });
          [program, preview] = [preview, program];
          event("CurrentProgramSceneChanged", { sceneName: program });
          event("CurrentPreviewSceneChanged", { sceneName: preview });
          event("SceneTransitionEnded");
          if (!deferVideoEnd) event("SceneTransitionVideoEnded");
          break;
      }
      const reply = () => ws.send(
        JSON.stringify({
          op: 7,
          d: {
            requestId: d.requestId,
            requestType: d.requestType,
            requestStatus: {
              result,
              code: result ? 100 : 500,
              comment: result ? undefined : d.requestType === "TriggerMediaInputAction" ? "Playback failed" : "Transition failed",
            },
            responseData,
          },
        }),
      );
      if (holdOutputStatus && ["GetStreamStatus", "GetRecordStatus"].includes(d.requestType)) heldOutputReplies.push(reply);
      else if (d.requestType === "GetSceneItemList" && holdSceneItems) heldSceneReply = reply;
      else reply();
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
  it("starts and stops outputs explicitly without Studio Mode or scene mutations", async () => {
    await connect();
    streamOutput.outputActive = false;
    requests = [];
    for (const output of ["stream", "recording"] as const) {
      expect(await client.setOutputActive(output, true)).toBe(true);
      expect(await client.setOutputActive(output, true)).toBe(true);
      expect(await client.setOutputActive(output, false)).toBe(true);
    }
    expect(requests.filter((type) => /^(Start|Stop)(Stream|Record)$/.test(type)))
      .toEqual(["StartStream", "StopStream", "StartRecord", "StopRecord"]);
    expect(requests).not.toContain("SetCurrentProgramScene");
    expect(requests).not.toContain("SetCurrentPreviewScene");
    expect(client.getSnapshot()).toMatchObject({ studio: false, program: "Starting", preview: null, busy: false });
  });
  it("reports output command failures and blocks concurrent commands", async () => {
    await connect();
    rejectOutputCommand = true;
    expect(await client.setOutputActive("stream", false)).toBe(false);
    expect(client.getSnapshot().error).toBeTruthy();
    expect(client.getSnapshot().busy).toBe(false);
    rejectOutputCommand = false;
    holdOutputStatus = true;
    const pending = client.setOutputActive("stream", false);
    await vi.waitFor(() => expect(heldOutputReplies).toHaveLength(1));
    expect(await client.setOutputActive("recording", true)).toBe(false);
    heldOutputReplies.forEach((reply) => reply());
    expect(await pending).toBe(true);
    expect(requests).not.toContain("StartRecord");
  });
  it("does not mutate an output after its status read outlives the session", async () => {
    await connect();
    holdOutputStatus = true;
    const pending = client.setOutputActive("stream", false);
    await vi.waitFor(() => expect(heldOutputReplies).toHaveLength(1));
    client.disconnect();
    heldOutputReplies.forEach((reply) => reply());
    expect(await pending).toBe(false);
    expect(requests).not.toContain("StopStream");
  });
  it("clears current scene thumbnails including hidden scenes without OBS requests", async () => {
    vi.mocked(readPreview).mockResolvedValue("data:image/jpeg;base64,saved");
    await connect();
    await vi.waitFor(() => expect(Object.keys(client.getSnapshot().thumbnails)).toHaveLength(3));
    client.setSceneHidden("Camera", true);
    requests = [];
    const epoch = client.getSnapshot().previewEpoch;
    await client.resetPreviews();
    expect(clearPreviews).toHaveBeenCalledExactlyOnceWith(sceneList.map((scene) => JSON.stringify([url, "Collection A", scene.sceneName])));
    expect(client.getSnapshot()).toMatchObject({ thumbnails: {}, previewReady: null, previewEpoch: epoch + 1,
      busy: false, studio: false, preview: null, program: "Starting", hiddenScenes: ["Camera"] });
    expect(requests).toEqual([]);
  });
  it("discards pending thumbnail hydration after reset", async () => {
    let resolve!: (frame: string) => void;
    vi.mocked(readPreview).mockImplementation(() => new Promise((done) => { resolve = done; }));
    await connect();
    await client.resetPreviews();
    resolve("data:image/jpeg;base64,obsolete");
    await Promise.resolve();
    expect(client.getSnapshot().thumbnails).toEqual({});
  });
  it("reports reset storage failures, releases controls, and allows retry", async () => {
    await connect();
    vi.mocked(clearPreviews).mockRejectedValueOnce(new Error("Storage blocked"));
    await client.resetPreviews();
    expect(client.getSnapshot()).toMatchObject({ thumbnails: {}, busy: false, error: "Could not clear saved previews. Please try again." });
    await client.resetPreviews();
    expect(client.getSnapshot().error).toBeNull();
  });
  it("blocks repeated resets and does not restore state after disconnect", async () => {
    await connect();
    let resolve!: () => void;
    vi.mocked(clearPreviews).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = client.resetPreviews();
    await client.resetPreviews();
    expect(clearPreviews).toHaveBeenCalledOnce();
    expect(client.getSnapshot().busy).toBe(true);
    client.disconnect();
    resolve();
    await pending;
    expect(client.getSnapshot()).toMatchObject({ status: "disconnected", thumbnails: {}, busy: false });
  });
  it("reads output activity and OBS durations without changing scenes or locking controls", async () => {
    await connect();
    requests = [];
    expect(await client.getOutputStatuses()).toEqual({
      stream: { active: true, duration: 3_600_000, reconnecting: false },
      recording: { active: false, duration: 0, paused: false },
    });
    streamOutput = { outputActive: true, outputDuration: 3_601_000, outputReconnecting: true };
    recordOutput = { outputActive: true, outputDuration: 12_345, outputPaused: true };
    expect(await client.getOutputStatuses()).toEqual({
      stream: { active: true, duration: 3_601_000, reconnecting: true },
      recording: { active: true, duration: 12_345, paused: true },
    });
    expect(requests).toEqual(["GetStreamStatus", "GetRecordStatus", "GetStreamStatus", "GetRecordStatus"]);
    expect(client.getSnapshot()).toMatchObject({ busy: false, syncing: false, program: "Starting", preview: null });
  });
  it("isolates output read errors and recovers without a global scene error", async () => {
    await connect();
    rejectStreamStatus = true;
    expect(await client.getOutputStatuses()).toEqual({
      stream: null,
      recording: { active: false, duration: 0, paused: false },
    });
    expect(client.getSnapshot().error).toBeNull();
    rejectStreamStatus = false;
    expect((await client.getOutputStatuses()).stream?.active).toBe(true);
  });
  it("discards output replies from a disconnected session", async () => {
    await connect();
    holdOutputStatus = true;
    const pending = client.getOutputStatuses();
    const rejected = expect(pending).rejects.toThrow("OBS session changed");
    await vi.waitFor(() => expect(heldOutputReplies).toHaveLength(2));
    client.disconnect();
    heldOutputReplies.forEach((reply) => reply());
    await rejected;
    await expect(client.getOutputStatuses()).rejects.toThrow("OBS is not connected");
  });
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

it("discovers only active media, seeks in milliseconds, and keeps scene selections unchanged", async () => {
  await connect();
  await client.enableStudio();
  expect(await client.getActiveMedia()).toEqual([
    { name: "Clip", live: false, preview: false, program: true, state: "OBS_MEDIA_STATE_PLAYING", duration: 60000, cursor: 5000 },
  ]);
  expect(requests.filter((r) => r === "GetMediaInputStatus")).toHaveLength(1);
  expect(await client.seekMedia("Clip", 25000)).toBe(true);
  expect(mediaCursor).toBe(25000);
  expect(client.getSnapshot()).toMatchObject({ preview: "Camera", program: "Starting", busy: false });
  expect(requests).not.toContain("TriggerStudioModeTransition");
  mediaActive = false;
  expect(await client.getActiveMedia()).toEqual([]);
});

it("guards media seeking against invalid positions, inactive sources, and unavailable playback", async () => {
  await connect();
  expect(await client.seekMedia("Clip", 1000)).toBe(false);
  expect(requests).not.toContain("SetMediaInputCursor");
  await client.enableStudio();
  for (const cursor of [-1, 60001, NaN, 1.5]) expect(await client.seekMedia("Clip", cursor)).toBe(false);
  mediaActive = false;
  await client.seekMedia("Clip", 1000);
  mediaActive = true;
  mediaDuration = null;
  await client.seekMedia("Clip", 1000);
  mediaDuration = 60000;
  mediaState = "OBS_MEDIA_STATE_STOPPED";
  await client.seekMedia("Clip", 1000);
  expect(requests).not.toContain("SetMediaInputCursor");
  mediaState = "OBS_MEDIA_STATE_PAUSED";
  await client.seekMedia("Clip", 1000);
  expect(mediaCursor).toBe(1000);
});

it("sends exact near-end positions for an 18-second clip", async () => {
  mediaDuration = 18000;
  mediaCursor = 15000;
  await connect();
  await client.enableStudio();
  for (const target of [16000, 17000, 18000]) {
    expect(await client.seekMedia("Clip", target)).toBe(true);
    expect(mediaCursor).toBe(target);
    expect((await client.getActiveMedia())[0].cursor).toBe(target);
  }
});

it("finds Preview media through enabled nested scenes/groups and deduplicates shared sources", async () => {
  previewItems.Camera = [
    { sourceName: "Nested", sourceType: "OBS_SOURCE_TYPE_SCENE", sceneItemEnabled: true },
    { sourceName: "Hidden clip", sceneItemEnabled: false },
    { sourceName: "Disabled scene", sourceType: "OBS_SOURCE_TYPE_SCENE", sceneItemEnabled: false },
  ];
  previewItems.Nested = [
    { sourceName: "Clips", isGroup: true, sceneItemEnabled: true },
    { sourceName: "Camera", sourceType: "OBS_SOURCE_TYPE_SCENE", sceneItemEnabled: true },
    { sourceName: "Clip", sceneItemEnabled: true },
  ];
  previewItems["Disabled scene"] = [{ sourceName: "Hidden clip", sceneItemEnabled: true }];
  groupItems.Clips = [{ sourceName: "Clip", sceneItemEnabled: true }];
  await connect();
  await client.enableStudio();
  expect(await client.getActiveMedia()).toEqual([
    { name: "Clip", live: false, preview: true, program: true, state: mediaState, duration: 60000, cursor: 5000 },
  ]);
  expect(requests.filter((r) => r === "GetMediaInputStatus")).toHaveLength(1);
  mediaActive = false;
  expect(await client.getActiveMedia()).toEqual([
    { name: "Clip", live: false, preview: true, program: false, state: mediaState, duration: 60000, cursor: 5000 },
  ]);
  await client.seekMedia("Clip", 30000);
  expect(mediaCursor).toBe(30000);
  expect(client.getSnapshot()).toMatchObject({ preview: "Camera", program: "Starting" });
  expect(requests).not.toContain("TriggerStudioModeTransition");
  preview = "Slides";
  event("CurrentPreviewSceneChanged", { sceneName: preview });
  await expect.poll(() => client.getSnapshot().preview).toBe("Slides");
  expect(await client.getActiveMedia()).toEqual([]);
  await client.seekMedia("Clip", 20000);
  expect(mediaCursor).toBe(30000);
});

it("does not include media that is only showing in an unrelated OBS window", async () => {
  mediaActive = false;
  await connect();
  await client.enableStudio();
  expect(await client.getActiveMedia()).toEqual([]);
  await client.seekMedia("Hidden clip", 1000);
  expect(requests).not.toContain("SetMediaInputCursor");
});

it("discards an in-flight Preview seek when the selected scene changes", async () => {
  previewItems.Camera = [{ sourceName: "Clip", sceneItemEnabled: true }];
  mediaActive = false;
  await connect();
  await client.enableStudio();
  holdSceneItems = true;
  const seek = client.seekMedia("Clip", 30000);
  await expect.poll(() => heldSceneReply).toBeDefined();
  preview = "Slides";
  event("CurrentPreviewSceneChanged", { sceneName: preview });
  await expect.poll(() => client.getSnapshot().preview).toBe("Slides");
  heldSceneReply!();
  expect(await seek).toBe(false);
  expect(requests).not.toContain("SetMediaInputCursor");
});

it("pauses, resumes, stops, and restarts Program media with explicit OBS actions", async () => {
  await connect();
  await client.enableStudio();
  await client.setMediaPlayback("Clip", "pause");
  expect(mediaState).toBe("OBS_MEDIA_STATE_PAUSED");
  await client.setMediaPlayback("Clip", "pause");
  expect(mediaActions).toHaveLength(1);
  await client.setMediaPlayback("Clip", "play");
  expect(mediaCursor).toBe(5000);
  await client.setMediaPlayback("Clip", "stop");
  expect(mediaState).toBe("OBS_MEDIA_STATE_STOPPED");
  await client.setMediaPlayback("Clip", "play");
  expect(mediaCursor).toBe(0);
  mediaState = "OBS_MEDIA_STATE_ENDED";
  await client.setMediaPlayback("Clip", "play");
  expect(mediaActions).toEqual(["PAUSE", "PLAY", "STOP", "RESTART", "RESTART"].map((action) => ({
    inputName: "Clip", mediaAction: `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_${action}`,
  })));
  expect(client.getSnapshot()).toMatchObject({ preview: "Camera", program: "Starting", busy: false });
  expect(requests).not.toContain("TriggerStudioModeTransition");
});

it("controls Preview-only media without requiring a seekable duration", async () => {
  previewItems.Camera = [{ sourceName: "Clip", sceneItemEnabled: true }];
  mediaActive = false;
  mediaDuration = null;
  await connect();
  await client.enableStudio();
  await client.setMediaPlayback("Clip", "pause");
  await client.setMediaPlayback("Clip", "play");
  await client.setMediaPlayback("Clip", "stop");
  expect(mediaActions).toHaveLength(3);
  expect(client.getSnapshot()).toMatchObject({ preview: "Camera", program: "Starting" });
});

it("guards playback actions when unavailable or busy and reports request errors", async () => {
  await client.setMediaPlayback("Clip", "pause");
  await connect();
  await client.setMediaPlayback("Clip", "pause");
  expect(mediaActions).toHaveLength(0);
  await client.enableStudio();
  mediaActive = false;
  await client.setMediaPlayback("Clip", "pause");
  mediaActive = true;
  mediaState = "OBS_MEDIA_STATE_ERROR";
  await client.setMediaPlayback("Clip", "play");
  await client.setMediaPlayback("Clip", "stop");
  expect(mediaActions).toHaveLength(0);
  mediaState = "OBS_MEDIA_STATE_PLAYING";
  deferVideoEnd = true;
  await client.transition("Fade");
  await client.setMediaPlayback("Clip", "stop");
  expect(mediaActions).toHaveLength(0);
  event("SceneTransitionVideoEnded");
  await expect.poll(() => client.getSnapshot().syncing || client.getSnapshot().busy).toBe(false);
  rejectMediaAction = true;
  await client.setMediaPlayback("Clip", "stop");
  expect(client.getSnapshot()).toMatchObject({ busy: false, error: "Playback failed" });
});

it("discards pending playback commands after a collection change", async () => {
  await connect();
  await client.enableStudio();
  holdSceneItems = true;
  const action = client.setMediaPlayback("Clip", "stop");
  await expect.poll(() => heldSceneReply).toBeDefined();
  const epoch = client.getSnapshot().previewEpoch;
  event("CurrentSceneCollectionChanging");
  await expect.poll(() => client.getSnapshot().previewEpoch).toBe(epoch + 1);
  heldSceneReply!();
  await action;
  expect(mediaActions).toHaveLength(0);
});

it("caches natural media frames after 5s without seeking and reuses them until explicit generation", async () => {
  previewItems.Camera = [
    { sourceName: "Clip", inputKind: "ffmpeg_source", sceneItemEnabled: true },
  ];
  mediaCursor = 1000;
  await connect();
  await client.enableStudio();
  await client.collectPreviews();
  expect(client.getSnapshot().thumbnails).toEqual({
    Starting: "data:image/jpeg;base64,frame",
  });
  expect(client.getSnapshot().previewReady).toBeNull();
  expect(requests).not.toContain("SetMediaInputCursor");
  mediaCursor = 5200;
  await client.collectPreviews();
  expect(client.getSnapshot().thumbnails.Camera).toBe(
    "data:image/jpeg;base64,frame",
  );
  expect(client.getSnapshot().previewReady).toBe("Camera");
  const count = requests.filter(
    (type) => type === "GetSourceScreenshot",
  ).length;
  await client.collectPreviews();
  expect(
    requests.filter((type) => type === "GetSourceScreenshot"),
  ).toHaveLength(count);
  expect(writePreview).toHaveBeenCalled();
  mediaCursor = 0;
  await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBeNull();
  expect(client.getSnapshot().thumbnails.Camera).toBeTruthy();
});
it("rejects black candidates and clears session images on disconnect", async () => {
  vi.mocked(usablePreview).mockResolvedValue(false);
  await connect();
  await client.enableStudio();
  await client.collectPreviews();
  expect(client.getSnapshot().thumbnails).toEqual({});
  vi.mocked(usablePreview).mockResolvedValue(true);
  await client.collectPreviews();
  expect(client.getSnapshot().thumbnails.Camera).toBeTruthy();
  client.disconnect();
  expect(client.getSnapshot().thumbnails).toEqual({});
});
it("hydrates persisted thumbnails for this endpoint, collection, and scene", async () => {
  vi.mocked(readPreview).mockResolvedValue("data:image/jpeg;base64,saved");
  await connect();
  await expect
    .poll(() => client.getSnapshot().thumbnails.Camera)
    .toBe("data:image/jpeg;base64,saved");
  expect(readPreview).toHaveBeenCalledWith(
    JSON.stringify([url, "Collection A", "Camera"]),
  );
});

it("isolates same-name scene thumbnails after changing collections", async () => {
  vi.mocked(readPreview).mockResolvedValue("data:image/jpeg;base64,collection-a");
  await connect();
  await expect.poll(() => client.getSnapshot().thumbnails.Camera).toBe("data:image/jpeg;base64,collection-a");
  vi.mocked(readPreview).mockResolvedValue(undefined);
  const epoch = client.getSnapshot().previewEpoch;
  event("CurrentSceneCollectionChanging");
  await expect.poll(() => client.getSnapshot().previewEpoch).toBe(epoch + 1);
  expect(client.getSnapshot().thumbnails).toEqual({});
  collectionName = "Collection B";
  event("CurrentSceneCollectionChanged");
  await expect.poll(() => client.getSnapshot().scenes.length).toBe(3);
  await expect.poll(() => vi.mocked(readPreview).mock.calls.some(([key]) => key === JSON.stringify([url, "Collection B", "Camera"]))).toBe(true);
  expect(client.getSnapshot().thumbnails).toEqual({});
});

it("caches natural playback from an available clip despite an unavailable camera", async () => {
  previewItems.Camera = [
    { sourceName: "Unavailable camera", inputKind: "ffmpeg_source", sceneItemEnabled: true },
    { sourceName: "Clip", inputKind: "ffmpeg_source", sceneItemEnabled: true },
  ];
  mediaCursor = 1000;
  await connect(); await client.enableStudio(); await client.collectPreviews();
  expect(client.getSnapshot().thumbnails.Camera).toBeUndefined();
  mediaCursor = 5200;
  await client.collectPreviews();
  expect(client.getSnapshot().thumbnails.Camera).toBe("data:image/jpeg;base64,frame");
  expect(client.getSnapshot().previewReady).toBe("Camera");
  expect(requests).not.toContain("SetMediaInputCursor");
  expect(requests).not.toContain("TriggerMediaInputAction");
});

it("uses live Preview for an enabled capture card despite unavailable media and a saved thumbnail", async () => {
  previewItems.Camera = [
    { sourceName: "Unavailable camera", inputKind: "ffmpeg_source", sceneItemEnabled: true },
    { sourceName: "Capture Card Device", inputKind: "macos-avcapture-fast", sceneItemEnabled: true },
  ];
  vi.mocked(readPreview).mockResolvedValue("data:image/jpeg;base64,saved");
  await connect(); await client.enableStudio();
  await expect.poll(() => client.getSnapshot().thumbnails.Camera).toBeTruthy();
  await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBe("Camera");
  expect(requests).not.toContain("SetMediaInputCursor");
  expect(requests).not.toContain("TriggerMediaInputAction");
});

it("returns to the cached media gate when the capture device is disabled", async () => {
  const device = { sourceName: "Device", inputKind: "macos-avcapture-fast", sceneItemEnabled: true };
  previewItems.Camera = [
    { sourceName: "Unavailable camera", inputKind: "ffmpeg_source", sceneItemEnabled: true },
    device,
  ];
  await connect(); await client.enableStudio(); await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBe("Camera");
  expect(client.getSnapshot().thumbnails.Camera).toBeTruthy();
  device.sceneItemEnabled = false;
  await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBeNull();
  expect(client.getSnapshot().thumbnails.Camera).toBeTruthy();
});

it("uses live Preview for playing non-local camera media with an unknown duration", async () => {
  previewItems.Camera = [{ sourceName: "Clip", inputKind: "ffmpeg_source", sceneItemEnabled: true }];
  mediaInputSettings.Clip = { inputKind: "ffmpeg_source", inputSettings: { is_local_file: false } };
  mediaDuration = -9223372036854776; mediaCursor = 45;
  vi.mocked(readPreview).mockResolvedValue("data:image/jpeg;base64,saved");
  await connect(); await client.enableStudio();
  await expect.poll(() => client.getSnapshot().thumbnails.Camera).toBeTruthy();
  await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBe("Camera");
  expect(requests).not.toContain("SetMediaInputCursor");
  expect(requests).not.toContain("TriggerMediaInputAction");
  mediaInputSettings.Clip.inputSettings.is_local_file = true;
  await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBeNull();
});
it("keeps finite network video files on the normal cached-preview path", async () => {
  previewItems.Camera = [{ sourceName: "Clip", inputKind: "ffmpeg_source", sceneItemEnabled: true }];
  mediaInputSettings.Clip = { inputKind: "ffmpeg_source", inputSettings: { is_local_file: false } };
  mediaDuration = 18000; mediaCursor = 45;
  vi.mocked(readPreview).mockResolvedValue("data:image/jpeg;base64,saved");
  await connect(); await client.enableStudio(); await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBeNull();
  mediaCursor = 5200;
  await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBe("Camera");
});

it("naturally caches a live feed and restores fallback eligibility when the feed stops", async () => {
  previewItems.Camera = [{ sourceName: "Clip", inputKind: "ffmpeg_source", sceneItemEnabled: true }];
  mediaInputSettings.Clip = { inputKind: "ffmpeg_source", inputSettings: { is_local_file: false } };
  mediaDuration = null; mediaCursor = 0;
  await connect(); await client.enableStudio(); await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBe("Camera");
  expect(client.getSnapshot().thumbnails.Camera).toBe("data:image/jpeg;base64,frame");
  mediaState = "OBS_MEDIA_STATE_ENDED";
  await client.collectPreviews();
  expect(client.getSnapshot().previewReady).toBeNull();
  expect(client.getSnapshot().thumbnails.Camera).toBeTruthy();
});

it.each([false, true])("skips hidden scenes in batch generation with showHiddenScenes=%s", async (showHiddenScenes) => {
  await connect();
  await client.enableStudio();
  client.setSceneHidden("Slides", true);
  client.setShowHiddenScenes(showHiddenScenes);
  const capture = vi.spyOn(client, "getScreenshot");
  const totals: number[] = [];
  const unsubscribe = client.subscribe(() => {
    const progress = client.getSnapshot().generating;
    if (progress) totals.push(progress.total);
  });
  const original = preview;
  await client.generatePreviews();
  unsubscribe();
  expect(capture.mock.calls.map(([scene]) => scene)).toEqual(["Starting", "Camera"]);
  expect(client.getSnapshot().thumbnails.Slides).toBeUndefined();
  expect(totals.length).toBeGreaterThan(0);
  expect(totals.every((total) => total === 2)).toBe(true);
  expect(preview).toBe(original);
});

it("does not visit scenes when every scene is hidden", async () => {
  await connect();
  await client.enableStudio();
  for (const scene of client.getSnapshot().scenes) client.setSceneHidden(scene, true);
  requests = [];
  await client.generatePreviews();
  expect(requests).not.toContain("SetCurrentPreviewScene");
  expect(requests).not.toContain("GetSourceScreenshot");
  expect(requests).not.toContain("TriggerMediaInputAction");
  expect(requests).not.toContain("SetMediaInputCursor");
  expect(client.getSnapshot().generating).toBeNull();
});

it("generates a thumbnail only for the requested scene and restores Preview", async () => {
  await connect();
  await client.enableStudio();
  const original = preview;
  requests = [];
  client.setSceneHidden("Starting", true);
  await client.generatePreviews("Starting");
  expect(client.getSnapshot().thumbnails.Starting).toBeTruthy();
  expect(client.getSnapshot().thumbnails.Camera).toBeUndefined();
  expect(preview).toBe(original);
  expect(requests).not.toContain("TriggerStudioModeTransition");
});

it("persists hidden scenes across reconnects and isolates collections", async () => {
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  try {
    await connect();
    client.setSceneHidden("Camera", true);
    expect(client.getSnapshot().hiddenScenes).toEqual(["Camera"]);
    client.disconnect();
    await connect();
    expect(client.getSnapshot().hiddenScenes).toEqual(["Camera"]);
    collectionName = "Collection B";
    await client.refresh();
    expect(client.getSnapshot().hiddenScenes).toEqual([]);
    collectionName = "Collection A";
    await client.refresh();
    expect(client.getSnapshot().hiddenScenes).toEqual(["Camera"]);
    client.setSceneHidden("Camera", false);
    await client.refresh();
    expect(client.getSnapshot().hiddenScenes).toEqual([]);
    expect(saved.size).toBe(0);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("classifies live media for controls even while paused or stopped, while retaining file controls", async () => {
  mediaInputSettings.Clip = { inputKind: "ffmpeg_source", inputSettings: { is_local_file: false } };
  mediaDuration = -9223372036854776;
  await connect(); await client.enableStudio();
  for (const state of ["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED", "OBS_MEDIA_STATE_STOPPED"]) {
    mediaState = state;
    expect((await client.getActiveMedia())[0]).toMatchObject({ name: "Clip", live: true });
  }
  mediaDuration = 18000;
  expect((await client.getActiveMedia())[0].live).toBe(false);
  mediaDuration = null;
  mediaInputSettings.Clip.inputSettings.is_local_file = true;
  expect((await client.getActiveMedia())[0].live).toBe(false);
});

it("records the Fade start and configured duration before OBS swaps scenes", async () => {
  await connect();
  await client.enableStudio();
  await client.setTransitionDuration(1200);
  const started = performance.now();
  await client.transition("Fade");
  expect(client.getSnapshot().monitorFade).toMatchObject({ from: "Starting", to: "Camera", duration: 1200 });
  expect(client.getSnapshot().monitorFade!.startedAt).toBeGreaterThanOrEqual(started);
  expect(client.getSnapshot().program).toBe("Camera");
  client.disconnect();
  expect(client.getSnapshot().monitorFade).toBeNull();
});

it("simulates renamed fades by OBS kind and skips Cut and other transition kinds", async () => {
  await connect();
  await client.enableStudio();
  transition = "Gentle dissolve";
  await client.refresh();
  event("SceneTransitionStarted", { transitionName: transition });
  await expect.poll(() => client.getSnapshot().monitorFade?.to).toBe("Camera");
  event("SceneTransitionVideoEnded");
  await expect.poll(() => client.getSnapshot().busy).toBe(false);
  await client.transition("Cut");
  expect(client.getSnapshot().monitorFade).toBeNull();
});

it("does not simulate a non-Fade transition", async () => {
  await connect();
  await client.enableStudio();
  transition = "Stinger";
  await client.refresh();
  await client.transition("Stinger");
  expect(client.getSnapshot().monitorFade).toBeNull();
});
