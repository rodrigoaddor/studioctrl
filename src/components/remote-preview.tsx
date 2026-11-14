import { useTranslation } from "react-i18next";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { TriangleAlert, Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import { RemoteSettingsError, readRemoteSettings, saveRemoteSettings, startRemotePreview, type RemoteSettings } from "../lib/remote-preview";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { PasswordInput } from "./password-input";
import { Slider } from "./ui/slider";

export function RemotePreviewDialog({ settingsKey, label, onSave, onClose, onRestoreFocus }: {
  settingsKey: string; label: string; onSave: (settings: RemoteSettings) => void; onClose: () => void; onRestoreFocus?: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => readRemoteSettings(settingsKey));
  const [error, setError] = useState("");
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
      <Dialog.Content onCloseAutoFocus={(event) => { if (onRestoreFocus) { event.preventDefault(); onRestoreFocus(); } }} className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-background p-6 text-foreground shadow-xl">
        <Dialog.Title className="font-heading text-lg font-semibold">{t("{{label}} · Remote Preview", { label: label })}</Dialog.Title>
        <Dialog.Description className="mt-2 text-xs text-muted-foreground">{t("Read a WebRTC stream from MediaMTX using WHEP. This shows the published feed (usually OBS Program), regardless of the selected scene.")}</Dialog.Description>
        <form className="mt-4 grid gap-4" onSubmit={(event) => {
          event.preventDefault();
          try { onSave(saveRemoteSettings(settingsKey, draft)); onClose(); }
          catch (e) { setError(e instanceof RemoteSettingsError ? e.message : t("Could not save settings. Check browser storage availability.")); }
        }}>
          <label className="grid gap-2 text-xs">{t("WebRTC URL")} <Input autoFocus required type="url" placeholder="https://media.example.com/mystream/whep" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            <span className="text-muted-foreground">{t("A MediaMTX stream page URL also works; /whep is added automatically. Use HTTPS when this app uses HTTPS.")}</span>
          </label>
          <label className="grid gap-2 text-xs">{t("Authentication")} <select className="h-8 border border-input bg-background px-2" value={draft.auth} onChange={(e) => setDraft({ ...draft, auth: e.target.value as RemoteSettings["auth"] })}>
              <option value="none">{t("None")}</option><option value="basic">{t("Username and password")}</option><option value="bearer">{t("Bearer token")}</option>
            </select>
          </label>
          {draft.auth === "basic" && <>
            <label className="grid gap-2 text-xs">{t("Username")}<Input required value={draft.username} autoComplete="username" pattern="[^:]+" title={t("Username cannot contain a colon")} onChange={(e) => setDraft({ ...draft, username: e.target.value })} /></label>
            <label className="grid gap-2 text-xs">{t("Password")}<PasswordInput value={draft.password} autoComplete="current-password" onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></label>
          </>}
          {draft.auth === "bearer" && <label className="grid gap-2 text-xs">{t("Bearer token")}<PasswordInput required secretLabel="bearer token" value={draft.token} autoComplete="off" onChange={(e) => setDraft({ ...draft, token: e.target.value })} /></label>}
          {draft.auth !== "none" && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={draft.remember} onChange={(e) => setDraft({ ...draft, remember: e.target.checked })} />{t("Remember credentials in this browser (stored without encryption)")}</label>}
          <p className="text-xs text-muted-foreground">{t("Click the preview to show mute and volume controls. Audio is off by default. The server must allow this app’s origin through CORS and advertise reachable WebRTC addresses.")}</p>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button><Button type="submit">{t("Save and connect")}</Button></div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function RemotePreview({ settings, streaming, onImageChange, expanded = false }: {
  settings: RemoteSettings; streaming?: boolean; onImageChange: (live: boolean) => void; expanded?: boolean;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [audio, setAudio] = useState(false);
  const [volume, setVolume] = useState(100);
  const { url, auth, username, password, token, remember } = settings;
  // Muting is local playback state and must not renegotiate the WHEP stream.
  const connectionSettings = useMemo(() => ({ url, auth, username, password, token, remember }),
    [url, auth, username, password, token, remember]);
  useEffect(() => {
    setError(""); setLive(false); setPlaybackBlocked(false); onImageChange(false);
    setAudio(false);
    video.current!.muted = true;
    if (!connectionSettings.url || (connectionSettings.auth === "basic" && !connectionSettings.username) || (connectionSettings.auth === "bearer" && !connectionSettings.token)) {
      setError("Open Remote Preview settings to enter the URL and credentials."); return;
    }
    const stop = startRemotePreview(connectionSettings, video.current!, (message) => {
      setError(message); setLive(false); setPlaybackBlocked(false); onImageChange(false);
    }, () => setPlaybackBlocked(true));
    return () => { stop(); onImageChange(false); };
  }, [connectionSettings, attempt, onImageChange]);
  function changeAudio(audio: boolean, nextVolume = volume) {
    setAudio(audio);
    const player = video.current!;
    player.volume = nextVolume / 100;
    player.muted = !audio;
    setVolume(nextVolume);
    if (audio) void player.play().catch(() => {
      if (video.current === player && !player.muted) setPlaybackBlocked(true);
    });
  }
  return <>
    <video ref={video} autoPlay muted={!audio} playsInline aria-label={t("Remote WebRTC stream")} className="absolute inset-0 size-full object-contain" onPlaying={() => { setPlaybackBlocked(false); setLive(true); onImageChange(true); }} />
    <RemoteAudioControls audio={audio} volume={volume} onChange={changeAudio} expanded={expanded} />
    {streaming === false && <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-black/90 via-black/60 via-40% to-transparent"
    />}
    {(!live || playbackBlocked || streaming === false) && <div role="status" className="absolute inset-x-12 bottom-1 flex flex-col items-center gap-2 text-center text-xs text-white/80">
      {playbackBlocked && <Button variant="outline" size="sm" onClick={() => {
        void video.current!.play().then(() => setPlaybackBlocked(false)).catch(() => {});
      }}>{t("Play stream")}</Button>}
      {!live && !playbackBlocked && <>
       {t(error || "Connecting WebRTC…")}
        {error && <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>{t("Retry")}</Button>}
      </>}
      {streaming === false && <span className="flex items-center justify-center gap-1.5 text-amber-300">
        <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
        {t("OBS is not streaming")} </span>}
    </div>}
  </>;
}

function RemoteAudioControls({ audio, volume, onChange, expanded }: {
  audio: boolean; volume: number; onChange: (audio: boolean, volume?: number) => void; expanded: boolean;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const controls = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragging = useRef(false);
  const keyboardFocus = useRef(false);
  const pointerFocus = useRef(false);
  const mouseInteraction = useRef(false);
  const lastVolume = useRef(100);
  const previousExpanded = useRef(expanded);
  const suppressHover = useRef(false);
  useLayoutEffect(() => {
    if (previousExpanded.current === expanded) return;
    previousExpanded.current = expanded;
    suppressHover.current = true;
    clearTimeout(timer.current);
    setVisible(false);
  }, [expanded]);
  const id = useId();
  function showControls() {
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!dragging.current && !(keyboardFocus.current && controls.current?.contains(document.activeElement))) setVisible(false);
    }, 3000);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  const audible = audio && volume > 0;
  const VolumeIcon = !audible ? VolumeX : volume <= 33 ? Volume : volume <= 66 ? Volume1 : Volume2;
  return <>
    <button type="button" aria-label={visible ? t("Hide remote audio controls") : t("Show remote audio controls")} aria-expanded={visible} aria-controls={id}
      className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      onPointerEnter={(event) => { if (event.pointerType === "mouse" && !suppressHover.current) showControls(); }}
      onPointerMove={(event) => { suppressHover.current = false; if (event.pointerType === "mouse") showControls(); }}
      onPointerDown={(event) => { pointerFocus.current = true; mouseInteraction.current = event.pointerType === "mouse"; }}
      onPointerCancel={() => { pointerFocus.current = false; }}
      onBlur={() => { pointerFocus.current = false; }}
      onKeyDown={() => { pointerFocus.current = false; mouseInteraction.current = false; }}
      onFocus={() => { if (!pointerFocus.current) showControls(); }}
      onClick={() => {
        pointerFocus.current = false;
        if (mouseInteraction.current) { showControls(); return; }
        if (visible) { clearTimeout(timer.current); setVisible(false); }
        else showControls();
      }} />
    <div ref={controls} id={id} role="group" aria-label={t("Remote audio controls")} aria-hidden={!visible} inert={!visible}
      className={`${visible ? "visible opacity-100" : "invisible pointer-events-none opacity-0"} flex transition-[opacity,visibility] duration-200 ease-in-out motion-reduce:transition-none absolute right-2 bottom-2 z-10 max-h-[calc(100%-1rem)] flex-col items-center gap-2 text-white`}
      onPointerDownCapture={() => { keyboardFocus.current = false; dragging.current = true; showControls(); }}
      onPointerMove={(event) => { suppressHover.current = false; if (event.pointerType === "mouse") showControls(); }}
      onPointerUpCapture={() => { dragging.current = false; showControls(); }}
      onPointerCancel={() => { dragging.current = false; showControls(); }}
      onLostPointerCapture={() => { dragging.current = false; showControls(); }}
      onFocusCapture={() => { if (!dragging.current) keyboardFocus.current = true; showControls(); }}
      onBlurCapture={showControls}
      onKeyDownCapture={() => { keyboardFocus.current = true; showControls(); }}>
      <div className="flex min-h-0 shrink flex-col items-center gap-2 bg-black/50 pt-3">
      <Slider orientation="vertical" className="data-vertical:h-24 data-vertical:min-h-0 data-vertical:w-9" min={0} max={100} step={1} value={[audio ? volume : 0]}
        thumbProps={{ "aria-label": t("Remote audio volume"), "aria-valuetext": `${audio ? volume : 0}%` }}
        onValueChange={([value]) => {
          showControls();
          if (value > 0) lastVolume.current = value;
          onChange(value > 0, value);
        }} />
      <Button variant="ghost" size="icon-lg"
        aria-label={audible ? t("Mute remote audio") : t("Unmute remote audio")}
        title={audible ? t("Mute audio") : t("Unmute audio")}
        className="shrink-0 border-0 text-white shadow-none hover:bg-white/15 hover:text-white focus-visible:bg-white/15 dark:hover:bg-white/15"
        onClick={() => { showControls(); onChange(!audible, volume || lastVolume.current); }}>
        <VolumeIcon aria-hidden="true" />
      </Button>
      </div>
    </div>
  </>;
}
