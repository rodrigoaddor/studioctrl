import { hasVisiblePixels } from "./screenshot-preview";
import type OBSWebSocket from "obs-websocket-js/json";

export const PREVIEW_POSITION = 5_000;
const playable = (state: string) =>
  ["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED"].includes(state);

export function representativeMediaReady(
  statuses: {
    mediaState: string;
    mediaCursor: number | null;
    mediaDuration: number | null;
  }[],
) {
  const first = statuses.find(
    (status) =>
      playable(status.mediaState) &&
      status.mediaDuration !== null &&
      Number.isFinite(status.mediaDuration) &&
      status.mediaDuration > 0 &&
      status.mediaCursor !== null &&
      Number.isFinite(status.mediaCursor),
  );
  return (
    !!first &&
    first.mediaCursor! >= Math.min(PREVIEW_POSITION, first.mediaDuration! / 2)
  );
}

type MediaStatus = {
  mediaState: string;
  mediaDuration: number | null;
};

// A missing duration alone can also mean a file is stopped or failed to load.
// Require OBS's explicit non-local Media Source setting; readiness also requires playback.
export async function liveMediaSource(
  obs: OBSWebSocket,
  inputName: string,
  status: MediaStatus,
) {
  if (
    (status.mediaDuration !== null &&
      Number.isFinite(status.mediaDuration) &&
      status.mediaDuration > 0)
  )
    return false;
  try {
    const { inputKind, inputSettings } = await obs.call("GetInputSettings", {
      inputName,
    });
    return (
      inputKind === "ffmpeg_source" && inputSettings?.is_local_file === false
    );
  } catch {
    return false;
  }
}

export async function liveMediaReady(obs: OBSWebSocket, inputName: string, status: MediaStatus) {
  return status.mediaState === "OBS_MEDIA_STATE_PLAYING" && await liveMediaSource(obs, inputName, status);
}

// Native video-device input kinds; source names are user-editable.
const captureDeviceKinds = new Set([
  "macos-avcapture-fast",
  "macos-avcapture",
  "av_capture_input",
  "dshow_input",
  "v4l2_input",
]);

export async function scenePreviewSources(
  obs: OBSWebSocket,
  sceneName: string,
) {
  const media = new Set<string>();
  let hasCaptureDevice = false;
  const visited = new Set<string>();
  async function visit(name: string, group = false) {
    const key = `${group}:${name}`;
    if (visited.has(key)) return;
    visited.add(key);
    const { sceneItems } = await obs.call(
      group ? "GetGroupSceneItemList" : "GetSceneItemList",
      { sceneName: name },
    );
    for (const item of sceneItems) {
      if (!item.sceneItemEnabled) continue;
      const source = String(item.sourceName);
      if (item.isGroup) await visit(source, true);
      else if (item.sourceType === "OBS_SOURCE_TYPE_SCENE") await visit(source);
      else if (["ffmpeg_source", "vlc_source"].includes(String(item.inputKind)))
        media.add(source);
      else if (captureDeviceKinds.has(String(item.inputKind)))
        hasCaptureDevice = true;
    }
  }
  await visit(sceneName);
  return { media: [...media], hasCaptureDevice };
}

export async function sceneMedia(obs: OBSWebSocket, sceneName: string) {
  return (await scenePreviewSources(obs, sceneName)).media;
}

// Decode a small sample once per candidate, rather than analyzing every live frame.
export async function usablePreview(data: string): Promise<boolean> {
  const image = new Image();
  try {
    image.src = data;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(image, 0, 0, 32, 18);
    const { data: pixels } = context.getImageData(0, 0, 32, 18);
    return hasVisiblePixels(pixels);
  } finally {
    image.src = "";
  }
}

class GenerationCancelled extends Error {}

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 200));

export async function generateScenePreviews({
  obs,
  scenes,
  current,
  capture,
  save,
  progress,
}: {
  obs: OBSWebSocket;
  scenes: string[];
  current: () => boolean;
  capture: (scene: string) => Promise<string>;
  save: (scene: string, data: string) => Promise<boolean>;
  progress: (scene: string, completed: number) => void;
}) {
  const original = (await obs.call("GetCurrentPreviewScene")).sceneName;
  let owned = original;
  let completed = 0;
  let skipped = 0;
  const check = async () => {
    if (!current())
      throw new GenerationCancelled(
        "Preview generation cancelled: OBS session changed.",
      );
    const [preview, studio] = await Promise.all([
      obs.call("GetCurrentPreviewScene"),
      obs.call("GetStudioModeEnabled"),
    ]);
    if (!current() || !studio.studioModeEnabled || preview.sceneName !== owned)
      throw new GenerationCancelled(
        "Preview generation stopped because Preview changed in OBS.",
      );
  };
  const safeMedia = async (inputName: string) => {
    await check();
    if (
      (await obs.call("GetSourceActive", { sourceName: inputName })).videoActive
    )
      throw new GenerationCancelled(
        "Preview generation stopped to protect media playing on Program.",
      );
    if (!current())
      throw new GenerationCancelled("Preview generation cancelled.");
  };
  try {
    for (const scene of scenes) {
      await check();
      progress(scene, completed);
      const inputs = await sceneMedia(obs, scene);
      const active = await Promise.all(
        inputs.map((sourceName) => obs.call("GetSourceActive", { sourceName })),
      );
      // Capturing Program is safe; activating/seeking shared Program media is not.
      if (active.some((source) => source.videoActive)) {
        skipped++;
        completed++;
        continue;
      }
      const originals = (
        await Promise.all(
          inputs.map(async (inputName) => {
            try {
              return {
                inputName,
                ...(await obs.call("GetMediaInputStatus", { inputName })),
              };
            } catch {
              return null;
            }
          }),
        )
      ).filter((media) => media !== null);
      const touched = new Set<string>();
      const restoreMedia = async () => {
        // Restore only while we still own Preview and the sources remain off Program.
        for (const media of originals.filter((item) =>
          touched.has(item.inputName),
        )) {
          try {
            await safeMedia(media.inputName);
            if (playable(media.mediaState) && media.mediaCursor !== null) {
              await obs.call("SetMediaInputCursor", {
                inputName: media.inputName,
                mediaCursor: media.mediaCursor,
              });
              await safeMedia(media.inputName);
              await obs.call("TriggerMediaInputAction", {
                inputName: media.inputName,
                mediaAction:
                  media.mediaState === "OBS_MEDIA_STATE_PAUSED"
                    ? "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE"
                    : "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY",
              });
            } else {
              await obs.call("TriggerMediaInputAction", {
                inputName: media.inputName,
                mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
              });
            }
          } catch (error) {
            if (error instanceof GenerationCancelled) throw error;
            // Some unavailable inputs also reject STOP; restore the other inputs anyway.
          }
        }
      };
      try {
        await check();
        if (scene !== owned) {
          await obs.call("SetCurrentPreviewScene", { sceneName: scene });
          owned = scene;
        }
        for (const media of originals) {
          try {
            await safeMedia(media.inputName);
            let status = await obs.call("GetMediaInputStatus", {
              inputName: media.inputName,
            });
            if (await liveMediaReady(obs, media.inputName, status)) continue;
            await safeMedia(media.inputName);
            touched.add(media.inputName);
            if (!playable(status.mediaState)) {
              await obs.call("TriggerMediaInputAction", {
                inputName: media.inputName,
                mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
              });
            }
            status = await obs.call("GetMediaInputStatus", {
              inputName: media.inputName,
            });
            for (
              let attempt = 0;
              attempt < 10 &&
              (!playable(status.mediaState) ||
                !Number.isFinite(status.mediaDuration) ||
                !status.mediaDuration ||
                status.mediaDuration < 0);
              attempt++
            ) {
              await wait();
              await check();
              status = await obs.call("GetMediaInputStatus", {
                inputName: media.inputName,
              });
            }
            if (
              !playable(status.mediaState) ||
              !Number.isFinite(status.mediaDuration) ||
              !status.mediaDuration ||
              status.mediaDuration < 0
            )
              throw new Error(`Cannot load media: ${media.inputName}`);
            await safeMedia(media.inputName);
            await obs.call("SetMediaInputCursor", {
              inputName: media.inputName,
              mediaCursor: Math.min(
                PREVIEW_POSITION,
                Math.floor(status.mediaDuration / 2),
              ),
            });
            break;
          } catch (error) {
            if (error instanceof GenerationCancelled) throw error;
            // An unavailable camera/stream must not hide a usable clip later in the scene.
          }
        }
        let saved = false;
        for (let attempt = 0; attempt < 10 && !saved; attempt++) {
          await wait();
          await check();
          try {
            const frame = await capture(scene);
            await check();
            saved = await save(scene, frame);
          } catch (error) {
            if (error instanceof GenerationCancelled) throw error;
            // Monitors may own both screenshot slots; retry serially.
          }
        }
        if (!saved) skipped++;
      } catch (error) {
        if (error instanceof GenerationCancelled) throw error;
        skipped++;
      } finally {
        await restoreMedia();
      }
      completed++;
    }
  } finally {
    if (
      current() &&
      (await obs.call("GetCurrentPreviewScene")).sceneName === owned &&
      owned !== original
    ) {
      await obs.call("SetCurrentPreviewScene", { sceneName: original });
    }
  }
  return skipped;
}
