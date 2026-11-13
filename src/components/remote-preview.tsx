import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { readRemoteSettings, saveRemoteSettings, startRemotePreview, type RemoteSettings } from "../lib/remote-preview";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function RemotePreviewDialog({ settingsKey, label, onSave, onClose }: {
  settingsKey: string; label: string; onSave: (settings: RemoteSettings) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => readRemoteSettings(settingsKey));
  const [error, setError] = useState("");
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
      <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-background p-6 text-foreground shadow-xl">
        <Dialog.Title className="font-heading text-lg font-semibold">{label} · Remote Preview</Dialog.Title>
        <Dialog.Description className="mt-2 text-xs text-muted-foreground">
          Read a WebRTC stream from MediaMTX using WHEP. This shows the published feed (usually OBS Program), regardless of the selected scene.
        </Dialog.Description>
        <form className="mt-4 grid gap-4" onSubmit={(event) => {
          event.preventDefault();
          try { onSave(saveRemoteSettings(settingsKey, draft)); onClose(); }
          catch (e) { setError(e instanceof Error && /^(Enter|Use) /.test(e.message) ? e.message : "Could not save settings. Check browser storage availability."); }
        }}>
          <label className="grid gap-2 text-xs">WebRTC URL
            <Input autoFocus required type="url" placeholder="https://media.example.com/mystream/whep" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            <span className="text-muted-foreground">A MediaMTX stream page URL also works; /whep is added automatically. Use HTTPS when this app uses HTTPS.</span>
          </label>
          <label className="grid gap-2 text-xs">Authentication
            <select className="h-8 border border-input bg-background px-2" value={draft.auth} onChange={(e) => setDraft({ ...draft, auth: e.target.value as RemoteSettings["auth"] })}>
              <option value="none">None</option><option value="basic">Username and password</option><option value="bearer">Bearer token</option>
            </select>
          </label>
          {draft.auth === "basic" && <>
            <label className="grid gap-2 text-xs">Username<Input required value={draft.username} autoComplete="username" pattern="[^:]+" title="Username cannot contain a colon" onChange={(e) => setDraft({ ...draft, username: e.target.value })} /></label>
            <label className="grid gap-2 text-xs">Password<Input type="password" value={draft.password} autoComplete="current-password" onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></label>
          </>}
          {draft.auth === "bearer" && <label className="grid gap-2 text-xs">Bearer token<Input required type="password" value={draft.token} autoComplete="off" onChange={(e) => setDraft({ ...draft, token: e.target.value })} /></label>}
          {draft.auth !== "none" && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={draft.remember} onChange={(e) => setDraft({ ...draft, remember: e.target.checked })} />Remember credentials in this browser (stored without encryption)</label>}
          <p className="text-xs text-muted-foreground">Playback is muted. The server must allow this app’s origin through CORS and advertise reachable WebRTC addresses.</p>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save and connect</Button></div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function RemotePreview({ settings, onImageChange }: {
  settings: RemoteSettings; onImageChange: (live: boolean) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState(false);
  useEffect(() => {
    setError(""); setLive(false); onImageChange(false);
    if (!settings.url || (settings.auth === "basic" && !settings.username) || (settings.auth === "bearer" && !settings.token)) {
      setError("Open Remote Preview settings to enter the URL and credentials."); return;
    }
    const stop = startRemotePreview(settings, video.current!, (message) => {
      setError(message); setLive(false); onImageChange(false);
    });
    return () => { stop(); onImageChange(false); };
  }, [settings, attempt, onImageChange]);
  return <>
    <video ref={video} autoPlay muted playsInline aria-label="Remote WebRTC stream" className="absolute inset-0 size-full object-contain" onPlaying={() => { setLive(true); onImageChange(true); }} />
    {!live && <div role="status" className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-2 text-center text-xs text-white/80">
      {error || "Connecting WebRTC…"}
      {error && <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}
    </div>}
  </>;
}
