import OBSWebSocket from "obs-websocket-js/json";
import type { Profile } from "./profiles";

export const MIN_TRANSITION_DURATION = 50;
export const MAX_TRANSITION_DURATION = 20_000;

export interface StudioState {
  status: "disconnected" | "connecting" | "connected";
  profile: Profile | null;
  studio: boolean;
  previewEpoch: number;
  scenes: string[];
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
  scenes: [],
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
      this.update({ busy: false });
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
        const [scenes, transitions, current, preview] = await Promise.all([
          obs.call("GetSceneList"),
          obs.call("GetSceneTransitionList"),
          obs.call("GetCurrentSceneTransition"),
          studio.studioModeEnabled
            ? obs.call("GetCurrentPreviewScene")
            : Promise.resolve(null),
        ]);
        if (this.obs !== obs || revision !== this.revision) continue;
        this.update({
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
  private async command(
    action: (obs: OBSWebSocket) => Promise<unknown>,
    studioRequired = true,
  ) {
    const obs = this.obs;
    if (
      !obs ||
      this.state.status !== "connected" ||
      this.state.busy ||
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
