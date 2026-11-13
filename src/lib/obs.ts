import OBSWebSocket from "obs-websocket-js/json";
import type { Profile } from "./profiles";
import {
  generateScenePreviews,
  scenePreviewSources,
  usablePreview,
  representativeMediaReady,
  liveMediaReady,
  liveMediaSource,
} from "./scene-previews";
import { readPreview, writePreview } from "./preview-cache";
import { isSceneHidden, saveSceneHidden } from "./scene-visibility";

export const MIN_TRANSITION_DURATION = 50;
export const MAX_TRANSITION_DURATION = 20_000;

export interface ActiveMedia {
  name: string;
  live: boolean;
  preview: boolean;
  program: boolean;
  state: string;
  duration: number | null;
  cursor: number | null;
}

export interface StudioState {
  status: "disconnected" | "connecting" | "connected";
  profile: Profile | null;
  studio: boolean;
  previewEpoch: number;
  thumbnails: Record<string, string>;
  previewReady: string | null;
  generating: { scene: string; completed: number; total: number } | null;
  scenes: string[];
  hiddenScenes: string[];
  showHiddenScenes: boolean;
  preview: string | null;
  program: string | null;
  transitions: string[];
  currentTransition: string | null;
  duration: number | null;
  busy: boolean;
  syncing: boolean;
  error: string | null;
}
const initial: StudioState = {
  status: "disconnected",
  profile: null,
  studio: false,
  previewEpoch: 0,
  thumbnails: {},
  previewReady: null,
  generating: null,
  scenes: [],
  hiddenScenes: [],
  showHiddenScenes: false,
  preview: null,
  program: null,
  transitions: [],
  currentTransition: null,
  duration: null,
  busy: false,
  syncing: false,
  error: null,
};
export class StudioClient {
  private obs: OBSWebSocket | null = null;
  private listeners = new Set<() => void>();
  private state = initial;
  private revision = 0;
  private refreshPromise: Promise<void> | null = null;
  private refreshAgain = false;
  private screenshotAbort = new AbortController();
  private screenshotRequests = new Map<string, Promise<string>>();
  private cacheKeys = new Map<string, string>();
  private collecting = false;
  private transitionTimer: ReturnType<typeof setTimeout> | undefined;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<StudioState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  clearError = () => this.update({ error: null });
  private fail(error: unknown) {
    this.update({
      error:
        error instanceof Error
          ? error.message || "OBS request failed."
          : "OBS request failed.",
    });
  }
  disconnect = () => {
    const old = this.obs;
    this.obs = null;
    this.screenshotAbort.abort();
    this.screenshotAbort = new AbortController();
    this.screenshotRequests.clear();
    this.cacheKeys.clear();
    this.revision++;
    clearTimeout(this.transitionTimer);
    this.update({ ...initial, previewEpoch: this.state.previewEpoch + 1 });
    if (old) {
      old.removeAllListeners();
      void old.disconnect().catch(() => {});
    }
  };
  async connect(profile: Profile, password: string) {
    this.disconnect();
    const obs = new OBSWebSocket();
    this.obs = obs;
    // Never keep a password in the live connection state.
    this.update({
      status: "connecting",
      profile: { ...profile, password: undefined },
    });
    obs.on("ConnectionClosed", (error) => {
      if (this.obs !== obs) return;
      this.obs = null;
      this.screenshotAbort.abort();
      this.screenshotRequests.clear();
      this.revision++;
      clearTimeout(this.transitionTimer);
      this.update({
        ...initial,
        previewEpoch: this.state.previewEpoch + 1,
        error:
          error.code === 4009
            ? "Authentication failed. Check the OBS WebSocket password."
            : "Connection closed. Select a connection to reconnect.",
      });
    });
    const refresh = () => {
      if (this.obs === obs) void this.refresh();
    };
    obs.on("CurrentProgramSceneChanged", refresh);
    obs.on("CurrentPreviewSceneChanged", refresh);
    obs.on("StudioModeStateChanged", refresh);
    obs.on("SceneListChanged", refresh);
    obs.on("SceneNameChanged", refresh);
    obs.on("CurrentSceneCollectionChanging", () => {
      if (this.obs !== obs) return;
      this.screenshotAbort.abort();
      this.screenshotAbort = new AbortController();
      this.screenshotRequests.clear();
      this.update({
        syncing: true,
        thumbnails: {},
        previewReady: null,
        generating: null,
        scenes: [],
        preview: null,
        program: null,
        previewEpoch: this.state.previewEpoch + 1,
      });
    });
    obs.on("CurrentSceneCollectionChanged", refresh);
    obs.on("CurrentSceneTransitionChanged", refresh);
    obs.on("CurrentSceneTransitionDurationChanged", refresh);
    obs.on("SceneTransitionStarted", () => {
      if (this.obs === obs) this.update({ busy: true });
    });
    obs.on("SceneTransitionVideoEnded", () => {
      if (this.obs !== obs) return;
      clearTimeout(this.transitionTimer);
      this.update({ busy: !!this.state.generating });
      refresh();
    });
    try {
      await obs.connect(profile.url, password || undefined, { rpcVersion: 1 });
      if (this.obs !== obs) return;
      this.update({ status: "connected" });
      await this.refresh();
    } catch (error) {
      if (this.obs !== obs) return;
      this.disconnect();
      this.fail(error);
    }
  }
  refresh = (): Promise<void> => {
    this.revision++;
    this.refreshAgain = true;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.runRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  };
  private async runRefresh() {
    while (this.refreshAgain) {
      this.refreshAgain = false;
      const obs = this.obs;
      const revision = this.revision;
      if (!obs || this.state.status !== "connected") break;
      this.update({ syncing: true });
      try {
        const studio = await obs.call("GetStudioModeEnabled");
        const [scenes, transitions, current, preview, collection] =
          await Promise.all([
            obs.call("GetSceneList"),
            obs.call("GetSceneTransitionList"),
            obs.call("GetCurrentSceneTransition"),
            studio.studioModeEnabled
              ? obs.call("GetCurrentPreviewScene")
              : Promise.resolve(null),
            obs.call("GetSceneCollectionList"),
          ]);
        if (this.obs !== obs || revision !== this.revision) continue;
        const keys = new Map(
          scenes.scenes.map((scene) => [
            String(scene.sceneName),
            JSON.stringify([
              this.state.profile?.url,
              collection.currentSceneCollectionName,
              scene.sceneUuid ?? scene.sceneName,
            ]),
          ]),
        );
        const thumbnails = Object.fromEntries(
          Object.entries(this.state.thumbnails).filter(
            ([name]) => keys.get(name) === this.cacheKeys.get(name),
          ),
        );
        this.cacheKeys = keys;
        const epoch = this.state.previewEpoch;
        void Promise.all(
          [...keys].map(async ([name, key]) => {
            if (thumbnails[name]) return;
            const frame = await readPreview(key);
            if (
              frame &&
              this.obs === obs &&
              this.state.previewEpoch === epoch &&
              this.cacheKeys.get(name) === key &&
              !this.state.thumbnails[name]
            )
              this.update({
                thumbnails: { ...this.state.thumbnails, [name]: frame },
              });
          }),
        );
        this.update({
          thumbnails,
          hiddenScenes: [...keys]
            .filter(([, key]) => isSceneHidden(key))
            .map(([name]) => name),
          previewReady:
            preview?.sceneName === this.state.preview
              ? this.state.previewReady
              : null,
          studio: studio.studioModeEnabled,
          // OBS returns scenes bottom-to-top; its Scenes dock displays the highest index first.
          scenes: [...scenes.scenes]
            .sort((a, b) => Number(b.sceneIndex) - Number(a.sceneIndex))
            .map((s) => String(s.sceneName)),
          preview: preview?.sceneName ?? null,
          program: scenes.currentProgramSceneName,
          transitions: transitions.transitions.map((t) =>
            String(t.transitionName),
          ),
          currentTransition: current.transitionName,
          duration: current.transitionFixed ? null : current.transitionDuration,
          syncing: false,
        });
      } catch (error) {
        if (this.obs === obs && revision === this.revision) {
          this.update({ syncing: false });
          this.fail(error);
        }
      }
    }
  }
  private savePreview = async (scene: string, data: string, epoch: number) => {
    const key = this.cacheKeys.get(scene);
    if (
      !key ||
      !(await usablePreview(data)) ||
      this.state.previewEpoch !== epoch
    )
      return false;
    this.update({ thumbnails: { ...this.state.thumbnails, [scene]: data } });
    void writePreview(key, data);
    return true;
  };
  collectPreviews = async () => {
    const obs = this.obs;
    const epoch = this.state.previewEpoch;
    if (
      !obs ||
      !this.state.studio ||
      this.state.status !== "connected" ||
      this.state.busy ||
      this.state.syncing ||
      this.state.generating ||
      this.collecting
    )
      return;
    this.collecting = true;
    try {
      for (const scene of new Set([this.state.preview, this.state.program])) {
        if (
          !scene ||
          (scene !== this.state.preview && this.state.thumbnails[scene])
        )
          continue;
        const { media, hasCaptureDevice } = await scenePreviewSources(obs, scene);
        const statuses = await Promise.all(
          (hasCaptureDevice ? [] : media).map((inputName) =>
            obs.call("GetMediaInputStatus", { inputName }).catch(() => null),
          ),
        );
        const live = await Promise.all(
          statuses.map((status, index) =>
            status
              ? liveMediaReady(obs, media[index], status)
              : Promise.resolve(false),
          ),
        );
        if (
          this.obs !== obs ||
          this.state.previewEpoch !== epoch ||
          this.state.busy ||
          this.state.generating
        )
          return;
        const ready =
          hasCaptureDevice ||
          live.some(Boolean) ||
          media.length === 0 ||
          representativeMediaReady(statuses.filter((status) => status !== null));
        if (
          scene === this.state.preview &&
          this.state.previewReady !== (ready ? scene : null)
        )
          this.update({ previewReady: ready ? scene : null });
        if (!ready || this.state.thumbnails[scene]) continue;
        const frame = await this.getScreenshot(scene);
        if (this.obs === obs && !this.state.generating)
          await this.savePreview(scene, frame, epoch);
      }
    } catch {
      /* Unavailable/black frames are retried on the next natural visit. */
    } finally {
      this.collecting = false;
    }
  };
  setShowHiddenScenes = (showHiddenScenes: boolean) => {
    this.update({ showHiddenScenes });
  };
  setSceneHidden = (scene: string, hidden: boolean) => {
    const key = this.cacheKeys.get(scene);
    if (!key) return;
    saveSceneHidden(key, hidden);
    this.update({
      hiddenScenes: this.state.scenes.filter((name) =>
        name === scene ? hidden : this.state.hiddenScenes.includes(name),
      ),
    });
  };
  generatePreviews = (scene?: string) =>
    this.command(async (obs) => {
      const scenes =
        scene === undefined
          ? this.state.scenes.filter((name) => !this.state.hiddenScenes.includes(name))
          : this.state.scenes.filter((name) => name === scene);
      if (!scenes.length) return;
      const epoch = this.state.previewEpoch;
      const current = () =>
        this.obs === obs &&
        this.state.previewEpoch === epoch &&
        this.state.studio;
      this.update({
        generating: {
          scene: "",
          completed: 0,
          total: scenes.length,
        },
      });
      try {
        const skipped = await generateScenePreviews({
          obs,
          scenes,
          current,
          capture: this.getScreenshot,
          save: (scene, frame) =>
            current()
              ? this.savePreview(scene, frame, epoch)
              : Promise.resolve(false),
          progress: (scene, completed) => {
            if (current())
              this.update({
                generating: {
                  scene,
                  completed,
                  total: scenes.length,
                },
              });
          },
        });
        if (current() && skipped)
          this.update({
            error: `Preview generation finished. ${skipped} scene(s) skipped: media active on Program or no usable frame. Play those scenes normally to cache them.`,
          });
      } finally {
        if (this.obs === obs && this.state.previewEpoch === epoch)
          this.update({ generating: null });
      }
    });
  getScreenshot = (sceneName: string): Promise<string> => {
    const obs = this.obs;
    if (
      !obs ||
      this.state.status !== "connected" ||
      !this.state.studio ||
      !this.state.scenes.includes(sceneName)
    ) {
      return Promise.reject(new Error("Preview source unavailable"));
    }
    const pending = this.screenshotRequests.get(sceneName);
    if (pending) return pending;
    if (this.screenshotRequests.size >= 2)
      return Promise.reject(new Error("Preview requests are busy"));
    const signal = this.screenshotAbort.signal;
    const response = new Promise<{ imageData: string }>((resolve, reject) => {
      const cancel = () => {
        signal.removeEventListener("abort", cancel);
        reject(new Error("Preview session changed"));
      };
      signal.addEventListener("abort", cancel, { once: true });
      void obs
        .call("GetSourceScreenshot", {
          sourceName: sceneName,
          imageFormat: "jpg",
          imageWidth: 640,
          imageCompressionQuality: 65,
        })
        .then(
          (result) => {
            signal.removeEventListener("abort", cancel);
            resolve(result);
          },
          (error) => {
            signal.removeEventListener("abort", cancel);
            reject(error);
          },
        );
    });
    const request = response
      .then(({ imageData }) => {
        if (this.obs !== obs || !this.state.scenes.includes(sceneName))
          throw new Error("Preview session changed");
        if (!/^data:image\/(?:jpeg|jpg);base64,/.test(imageData))
          throw new Error("Invalid preview image");
        return imageData;
      })
      .finally(() => {
        if (this.screenshotRequests.get(sceneName) === request)
          this.screenshotRequests.delete(sceneName);
      });
    this.screenshotRequests.set(sceneName, request);
    return request;
  };
  private async getPreviewSources(obs: OBSWebSocket, epoch: number) {
    const sources = new Set<string>();
    const visited = new Set<string>();
    const current = () => this.obs === obs && this.state.previewEpoch === epoch && this.state.studio;
    const visit = async (sceneName: string, group = false): Promise<void> => {
      const key = `${group ? "group" : "scene"}:${sceneName}`;
      if (!current() || visited.has(key)) return;
      visited.add(key);
      const { sceneItems } = await obs.call(
        group ? "GetGroupSceneItemList" : "GetSceneItemList",
        { sceneName },
      );
      for (const item of sceneItems) {
        if (!current()) return;
        if (!item.sceneItemEnabled) continue;
        const name = String(item.sourceName);
        if (item.isGroup) await visit(name, true);
        else if (item.sourceType === "OBS_SOURCE_TYPE_SCENE") await visit(name);
        else sources.add(name);
      }
    };
    const { sceneName } = await obs.call("GetCurrentPreviewScene");
    await visit(sceneName);
    return sources;
  }
  getActiveMedia = async (): Promise<ActiveMedia[]> => {
    const obs = this.obs;
    const epoch = this.state.previewEpoch;
    const revision = this.revision;
    if (!obs || this.state.status !== "connected" || !this.state.studio)
      return [];
    const [{ inputs }, previewSources] = await Promise.all([
      obs.call("GetInputList"),
      this.getPreviewSources(obs, epoch),
    ]);
    const media: ActiveMedia[] = [];
    for (const input of inputs) {
      if (this.obs !== obs || this.state.previewEpoch !== epoch) return [];
      const kind = input.unversionedInputKind ?? input.inputKind;
      if (kind !== "ffmpeg_source" && kind !== "vlc_source") continue;
      const name = String(input.inputName);
      const { videoActive } = await obs.call("GetSourceActive", { sourceName: name });
      if (this.obs !== obs || this.state.previewEpoch !== epoch) return [];
      const preview = previewSources.has(name);
      if (!videoActive && !preview) continue;
      const status = await obs.call("GetMediaInputStatus", { inputName: name });
      const live = await liveMediaSource(obs, name, status);
      media.push({ name, live, preview, program: videoActive, state: status.mediaState, duration: status.mediaDuration, cursor: status.mediaCursor });
    }
    if (this.obs !== obs || this.state.previewEpoch !== epoch || revision !== this.revision || !this.state.studio)
      return [];
    return media;
  };
  seekMedia = (inputName: string, mediaCursor: number) => {
    const epoch = this.state.previewEpoch;
    const revision = this.revision;
    let applied = false;
    return this.command(async (obs) => {
      const [active, status, previewSources] = await Promise.all([
        obs.call("GetSourceActive", { sourceName: inputName }),
        obs.call("GetMediaInputStatus", { inputName }),
        this.getPreviewSources(obs, epoch),
      ]);
      if (this.obs !== obs || this.state.previewEpoch !== epoch || revision !== this.revision) return;
      if ((!active.videoActive && !previewSources.has(inputName)) || !Number.isInteger(mediaCursor) || mediaCursor < 0 ||
          !Number.isFinite(status.mediaDuration) || status.mediaDuration <= 0 ||
          mediaCursor > status.mediaDuration ||
          !["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED"].includes(status.mediaState))
        throw new Error("This media source is no longer available for seeking.");
      await obs.call("SetMediaInputCursor", { inputName, mediaCursor });
      applied = this.obs === obs && this.state.previewEpoch === epoch;
    }).then(() => applied);
  };
  setMediaPlayback = (inputName: string, action: "play" | "pause" | "stop") => {
    const epoch = this.state.previewEpoch;
    const revision = this.revision;
    return this.command(async (obs) => {
      const [active, status, previewSources] = await Promise.all([
        obs.call("GetSourceActive", { sourceName: inputName }),
        obs.call("GetMediaInputStatus", { inputName }),
        this.getPreviewSources(obs, epoch),
      ]);
      if (this.obs !== obs || this.state.previewEpoch !== epoch || revision !== this.revision) return;
      if (!active.videoActive && !previewSources.has(inputName))
        throw new Error("This media source is no longer available for playback control.");
      const state = status.mediaState;
      let mediaAction: string;
      if (action === "play" && ["OBS_MEDIA_STATE_STOPPED", "OBS_MEDIA_STATE_ENDED"].includes(state))
        mediaAction = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART";
      else if (action === "play" && state === "OBS_MEDIA_STATE_PAUSED")
        mediaAction = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY";
      else if (action === "pause" && state === "OBS_MEDIA_STATE_PLAYING")
        mediaAction = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE";
      else if (action === "stop" && ["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_PAUSED", "OBS_MEDIA_STATE_OPENING", "OBS_MEDIA_STATE_BUFFERING"].includes(state))
        mediaAction = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP";
      else return;
      await obs.call("TriggerMediaInputAction", { inputName, mediaAction });
    });
  };
  private async command(
    action: (obs: OBSWebSocket) => Promise<unknown>,
    studioRequired = true,
  ) {
    const obs = this.obs;
    if (
      !obs ||
      this.state.status !== "connected" ||
      this.state.busy ||
      this.state.generating ||
      this.state.syncing ||
      (studioRequired && !this.state.studio)
    )
      return;
    this.update({ busy: true, error: null });
    try {
      await action(obs);
      if (this.obs === obs) await this.refresh();
    } catch (error) {
      if (this.obs === obs) this.fail(error);
    } finally {
      if (this.obs === obs) this.update({ busy: false });
    }
  }
  enableStudio = () =>
    this.command(
      (obs) => obs.call("SetStudioModeEnabled", { studioModeEnabled: true }),
      false,
    );
  selectScene = (sceneName: string) =>
    this.command((obs) => obs.call("SetCurrentPreviewScene", { sceneName }));
  selectTransition = (transitionName: string) =>
    this.command((obs) =>
      obs.call("SetCurrentSceneTransition", { transitionName }),
    );
  setTransitionDuration = (transitionDuration: number) => {
    if (this.state.duration === null) return Promise.resolve();
    return this.command(async (obs) => {
      if (
        !Number.isInteger(transitionDuration) ||
        transitionDuration < MIN_TRANSITION_DURATION ||
        transitionDuration > MAX_TRANSITION_DURATION
      ) {
        throw new Error(
          "Transition duration must be an integer from 50 to 20,000 ms.",
        );
      }
      await obs.call("SetCurrentSceneTransitionDuration", {
        transitionDuration,
      });
    });
  };
  transition = async (transitionName: string) => {
    const obs = this.obs;
    if (
      !obs ||
      !this.state.studio ||
      this.state.status !== "connected" ||
      this.state.busy ||
      this.state.generating ||
      this.state.syncing
    )
      return;
    this.update({ busy: true, error: null });
    try {
      await obs.call("SetCurrentSceneTransition", { transitionName });
      if (this.obs !== obs) return;
      await obs.call("TriggerStudioModeTransition");
      if (this.obs !== obs) return;
      await this.refresh();
      // Cut may finish before its request response arrives. Other transitions unlock on OBS's video-end event.
      clearTimeout(this.transitionTimer);
      if (this.state.busy)
        this.transitionTimer = setTimeout(() => {
          if (this.obs === obs) {
            this.update({ busy: false });
            void this.refresh();
          }
        }, 30000);
    } catch (error) {
      if (this.obs === obs) {
        this.update({ busy: false });
        this.fail(error);
      }
    }
  };
}
