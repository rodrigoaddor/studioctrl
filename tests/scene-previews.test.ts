import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type OBSWebSocket from "obs-websocket-js/json";
import {
  generateScenePreviews,
  sceneMedia,
  scenePreviewSources,
} from "../src/lib/scene-previews";

let preview: string;
let active: boolean;
let valid: boolean;
let state: string;
let cursor: number | null;
let duration: number | null;
let call: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  preview = "Original";
  active = false;
  valid = true;
  state = "OBS_MEDIA_STATE_STOPPED";
  cursor = null;
  duration = null;
  call = vi.fn(async (type: string, data?: Record<string, unknown>) => {
    switch (type) {
      case "GetCurrentPreviewScene":
        return { sceneName: preview };
      case "GetStudioModeEnabled":
        return { studioModeEnabled: true };
      case "GetSourceActive":
        return { videoActive: active };
      case "GetSceneItemList":
        return {
          sceneItems:
            data?.sceneName === "Media"
              ? [
                  {
                    sourceName: "Clip",
                    inputKind: "ffmpeg_source",
                    sceneItemEnabled: true,
                  },
                ]
              : [],
        };
      case "GetMediaInputStatus":
        return {
          mediaState: state,
          mediaCursor: cursor,
          mediaDuration: duration,
        };
      case "SetCurrentPreviewScene":
        preview = String(data?.sceneName);
        return {};
      case "SetMediaInputCursor":
        cursor = Number(data?.mediaCursor);
        return {};
      case "TriggerMediaInputAction":
        if (data?.mediaAction === "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART") {
          state = "OBS_MEDIA_STATE_PLAYING";
          cursor = 0;
          duration = 18000;
        } else if (
          data?.mediaAction === "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP"
        ) {
          state = "OBS_MEDIA_STATE_STOPPED";
          cursor = null;
        } else if (
          data?.mediaAction === "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE"
        )
          state = "OBS_MEDIA_STATE_PAUSED";
        return {};
      default:
        throw new Error(type);
    }
  });
});
afterEach(() => vi.useRealTimers());
function options() {
  return {
    obs: { call } as unknown as OBSWebSocket,
    scenes: ["Media", "Static"],
    current: () => valid,
    capture: vi.fn(async () => "frame"),
    save: vi.fn(async () => true),
    progress: vi.fn(),
  };
}
it("loads media on Preview, seeks to 5s, captures, and restores playback and Preview without a transition", async () => {
  const config = options();
  config.capture.mockImplementation(async () => {
    if (preview === "Media") expect(cursor).toBe(5000);
    return "frame";
  });
  const result = generateScenePreviews(config);
  await vi.runAllTimersAsync();
  expect(await result).toBe(0);
  expect(config.save).toHaveBeenCalledTimes(2);
  expect(preview).toBe("Original");
  expect(state).toBe("OBS_MEDIA_STATE_STOPPED");
  expect(
    call.mock.calls.some(([type]) => /Program|Transition/.test(type)),
  ).toBe(false);
});
it("restores paused positions and bounds a short clip's target", async () => {
  state = "OBS_MEDIA_STATE_PAUSED";
  cursor = 1234;
  duration = 3000;
  const config = options();
  config.scenes = ["Media"];
  config.capture.mockImplementation(async () => {
    expect(cursor).toBe(1500);
    return "frame";
  });
  const result = generateScenePreviews(config);
  await vi.runAllTimersAsync();
  await result;
  expect(cursor).toBe(1234);
  expect(state).toBe("OBS_MEDIA_STATE_PAUSED");
});
it("skips shared Program media without activating or seeking it", async () => {
  active = true;
  const config = options();
  config.scenes = ["Media"];
  expect(await generateScenePreviews(config)).toBe(1);
  expect(config.capture).not.toHaveBeenCalled();
  expect(
    call.mock.calls.some(
      ([type]) => type.startsWith("Set") || type === "TriggerMediaInputAction",
    ),
  ).toBe(false);
});
it("retries black frames, preserves a previous cache on failure, and continues with other scenes", async () => {
  const config = options();
  config.save.mockImplementation(async (scene) => scene === "Static");
  const result = generateScenePreviews(config);
  await vi.runAllTimersAsync();
  expect(await result).toBe(1);
  expect(config.save).toHaveBeenCalledTimes(11);
  expect(preview).toBe("Original");
});
it("does not fight an external Preview change or restore media after losing ownership", async () => {
  const config = options();
  config.capture.mockImplementation(async () => {
    preview = "Operator choice";
    return "frame";
  });
  const result = generateScenePreviews(config).catch((error: Error) => error);
  await vi.runAllTimersAsync();
  expect(await result).toBeInstanceOf(Error);
  expect(preview).toBe("Operator choice");
  expect(
    call.mock.calls.filter(
      ([type, data]) =>
        type === "TriggerMediaInputAction" &&
        data?.mediaAction === "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
    ),
  ).toHaveLength(0);
  expect(config.save).not.toHaveBeenCalled();
});
it("does not send restoration commands into a replaced session", async () => {
  const config = options();
  config.capture.mockImplementation(async () => {
    valid = false;
    return "frame";
  });
  const result = generateScenePreviews(config).catch((error: Error) => error);
  await vi.runAllTimersAsync();
  expect(await result).toBeInstanceOf(Error);
  expect(preview).toBe("Media");
  expect(config.save).not.toHaveBeenCalled();
});
it("stops seeking or restoring a source that becomes active on Program", async () => {
  const config = options();
  config.capture.mockImplementation(async () => {
    active = true;
    return "frame";
  });
  const result = generateScenePreviews(config).catch((error: Error) => error);
  await vi.runAllTimersAsync();
  expect(await result).toBeInstanceOf(Error);
  expect(
    call.mock.calls.filter(([type]) => type === "SetMediaInputCursor"),
  ).toHaveLength(1);
});
it("traverses enabled nested scenes/groups once and deduplicates shared sources", async () => {
  call.mockImplementation(async (type, data) => {
    if (type === "GetSceneItemList" && data?.sceneName === "Root")
      return {
        sceneItems: [
          { sourceName: "Group", isGroup: true, sceneItemEnabled: true },
          {
            sourceName: "Hidden",
            sourceType: "OBS_SOURCE_TYPE_SCENE",
            sceneItemEnabled: false,
          },
          {
            sourceName: "Nested",
            sourceType: "OBS_SOURCE_TYPE_SCENE",
            sceneItemEnabled: true,
          },
        ],
      };
    if (type === "GetGroupSceneItemList")
      return {
        sceneItems: [
          {
            sourceName: "Nested",
            sourceType: "OBS_SOURCE_TYPE_SCENE",
            sceneItemEnabled: true,
          },
        ],
      };
    return {
      sceneItems: [
        { sourceName: "Clip", inputKind: "vlc_source", sceneItemEnabled: true },
        {
          sourceName: "Root",
          sourceType: "OBS_SOURCE_TYPE_SCENE",
          sceneItemEnabled: true,
        },
      ],
    };
  });
  expect(await sceneMedia(options().obs, "Root")).toEqual(["Clip"]);
  expect(call).toHaveBeenCalledTimes(3);
});

it.each(["unavailable", "request-error", "stop-error"])(
  "uses available media after a camera with %s",
  async (failure) => {
    const base = call.getMockImplementation()!;
    call.mockImplementation(async (type, data) => {
      if (type === "GetSceneItemList" && data?.sceneName === "Media")
        return {
          sceneItems: [
            {
              sourceName: "Unavailable camera",
              inputKind: "ffmpeg_source",
              sceneItemEnabled: true,
            },
            {
              sourceName: "Clip",
              inputKind: "ffmpeg_source",
              sceneItemEnabled: true,
            },
          ],
        };
      if (data?.inputName === "Unavailable camera") {
        if (type === "GetMediaInputStatus") {
          if (failure === "request-error")
            throw new Error("Camera status unavailable");
          return {
            mediaState: "OBS_MEDIA_STATE_ENDED",
            mediaCursor: null,
            mediaDuration: null,
          };
        }
        if (type === "TriggerMediaInputAction") {
          if (
            failure === "stop-error" &&
            data.mediaAction === "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP"
          )
            throw new Error("Camera cannot stop");
          return {};
        }
        if (type === "SetMediaInputCursor")
          throw new Error("Camera cannot seek");
      }
      return base(type, data);
    });
    const config = options();
    config.scenes = ["Media"];
    config.capture.mockImplementation(async () => {
      expect(cursor).toBe(5000);
      return "frame";
    });
    const result = generateScenePreviews(config);
    await vi.runAllTimersAsync();
    expect(await result).toBe(0);
    expect(config.save).toHaveBeenCalledWith("Media", "frame");
    expect(preview).toBe("Original");
    expect(state).toBe("OBS_MEDIA_STATE_STOPPED");
  },
);

it("seeks only the first available media source", async () => {
  const base = call.getMockImplementation()!;
  call.mockImplementation(async (type, data) => {
    if (type === "GetSceneItemList")
      return {
        sceneItems: ["Clip", "Other clip"].map((sourceName) => ({
          sourceName,
          inputKind: "ffmpeg_source",
          sceneItemEnabled: true,
        })),
      };
    return base(type, data);
  });
  const config = options();
  config.scenes = ["Media"];
  const result = generateScenePreviews(config);
  await vi.runAllTimersAsync();
  await result;
  expect(
    call.mock.calls.filter(
      ([type, data]) =>
        (type === "SetMediaInputCursor" ||
          type === "TriggerMediaInputAction") &&
        data?.inputName === "Other clip",
    ),
  ).toHaveLength(0);
});

it("detects enabled capture devices through nested scenes/groups and ignores hidden devices and audio capture", async () => {
  call.mockImplementation(async (type, data) => {
    if (data?.sceneName === "Root")
      return {
        sceneItems: [
          {
            sourceName: "Hidden device",
            inputKind: "macos-avcapture-fast",
            sceneItemEnabled: false,
          },
          { sourceName: "Group", isGroup: true, sceneItemEnabled: true },
          {
            sourceName: "Hidden scene",
            sourceType: "OBS_SOURCE_TYPE_SCENE",
            sceneItemEnabled: false,
          },
        ],
      };
    if (type === "GetGroupSceneItemList")
      return {
        sceneItems: [
          {
            sourceName: "Nested",
            sourceType: "OBS_SOURCE_TYPE_SCENE",
            sceneItemEnabled: true,
          },
        ],
      };
    return {
      sceneItems: [
        {
          sourceName: "Device",
          inputKind: "macos-avcapture-fast",
          sceneItemEnabled: true,
        },
        {
          sourceName: "Clip",
          inputKind: "ffmpeg_source",
          sceneItemEnabled: true,
        },
      ],
    };
  });
  expect(await scenePreviewSources(options().obs, "Root")).toEqual({
    media: ["Clip"],
    hasCaptureDevice: true,
  });
  expect(call).toHaveBeenCalledTimes(3);
  call.mockResolvedValue({
    sceneItems: [
      {
        sourceName: "Hidden device",
        inputKind: "macos-avcapture-fast",
        sceneItemEnabled: false,
      },
      {
        sourceName: "Audio",
        inputKind: "wasapi_input_capture",
        sceneItemEnabled: true,
      },
    ],
  });
  expect(await scenePreviewSources(options().obs, "Root")).toEqual({
    media: [],
    hasCaptureDevice: false,
  });
});

it("captures a playing live Media Source without seeking, restarting, or restoring its cursor", async () => {
  state = "OBS_MEDIA_STATE_PLAYING";
  cursor = 45;
  duration = -9223372036854776;
  const base = call.getMockImplementation()!;
  call.mockImplementation(async (type, data) => {
    if (type === "GetInputSettings")
      return {
        inputKind: "ffmpeg_source",
        inputSettings: { is_local_file: false },
      };
    return base(type, data);
  });
  const config = options();
  config.scenes = ["Media"];
  const result = generateScenePreviews(config);
  await vi.runAllTimersAsync();
  expect(await result).toBe(0);
  expect(config.save).toHaveBeenCalledWith("Media", "frame");
  expect(
    call.mock.calls.some(
      ([type]) =>
        type === "SetMediaInputCursor" || type === "TriggerMediaInputAction",
    ),
  ).toBe(false);
  expect(state).toBe("OBS_MEDIA_STATE_PLAYING");
  expect(cursor).toBe(45);
});
