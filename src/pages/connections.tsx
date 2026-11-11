import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useStudio } from "../context";
import {
  loadProfiles,
  normalizeUrl,
  saveProfiles,
  type Profile,
} from "../lib/profiles";

export function Connections() {
  const { client, status, profile: active } = useStudio();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState(loadProfiles);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState<Profile | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const passwordDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (formOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [formOpen]);
  useEffect(() => {
    if (connecting) passwordDialog.current?.showModal();
    else passwordDialog.current?.close();
  }, [connecting]);
  function persist(next: Profile[]) {
    try {
      saveProfiles(next);
      setProfiles(next);
      setError("");
      return true;
    } catch {
      setError(
        "Could not save connections. Check that browser storage is available.",
      );
      return false;
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const rememberPassword = data.get("remember") === "on";
      const p: Profile = {
        id: editing?.id ?? crypto.randomUUID(),
        name: String(data.get("name")).trim(),
        url: normalizeUrl(String(data.get("url"))),
        rememberPassword,
        ...(rememberPassword
          ? { password: String(data.get("password") ?? "") }
          : {}),
      };
      if (!p.name) throw new Error("Enter a connection name.");
      if (
        persist(
          editing
            ? profiles.map((old) => (old.id === p.id ? p : old))
            : [...profiles, p],
        )
      )
        setFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save connection.");
    }
  }
  async function connect(p: Profile, password: string) {
    setConnecting(null);
    await client.connect(p, password);
    if (client.getSnapshot().status === "connected") navigate("/studio");
  }
  function startConnect(p: Profile) {
    if (p.rememberPassword) void connect(p, p.password ?? "");
    else setConnecting(p);
  }
  return (
    <main className="connections-page page-width">
      <div className="page-heading">
        <h1>Connections</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setError("");
            setFormOpen(true);
          }}
        >
          <Plus /> Add connection
        </Button>
      </div>
      {error && !formOpen && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="connections-grid">
        {profiles.map((p) => (
          <article className="connection-card" key={p.id}>
            <h2>{p.name}</h2>
            <p className="endpoint">{p.url}</p>
            <div className="connection-footer">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                {p.rememberPassword ? (
                  <>
                    <Check size={13} /> Password remembered
                  </>
                ) : (
                  "Ask for password"
                )}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => {
                    setEditing(p);
                    setError("");
                    setFormOpen(true);
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete “${p.name}”?`))
                      persist(profiles.filter((old) => old.id !== p.id));
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={status === "connecting"}
              onClick={() =>
                active?.id === p.id && status === "connected"
                  ? navigate("/studio")
                  : startConnect(p)
              }
            >
              {status === "connecting" && active?.id === p.id ? (
                <>
                  <LoaderCircle className="animate-spin" /> Connecting…
                </>
              ) : (
                <>
                  {active?.id === p.id && status === "connected"
                    ? "Open studio"
                    : "Connect"}{" "}
                  <ArrowRight />
                </>
              )}
            </Button>
          </article>
        ))}
        {profiles.length === 0 && (
          <section className="empty-connections">
            <h2>No saved connections</h2>
            <p>Add an OBS WebSocket connection.</p>
          </section>
        )}
      </div>
      <p className="setup-note">
        Enable the server in OBS under Tools → WebSocket Server Settings.
      </p>
      <dialog
        ref={dialog}
        onCancel={() => setFormOpen(false)}
        onClose={() => setFormOpen(false)}
      >
        {formOpen && (
          <form onSubmit={save} key={editing?.id ?? "new"}>
            <div className="dialog-heading">
              <h2>{editing ? "Edit connection" : "New connection"}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={() => setFormOpen(false)}
              >
                <X />
              </Button>
            </div>
            <label>
              Connection name
              <Input
                name="name"
                placeholder="Main studio"
                defaultValue={editing?.name}
                required
                autoFocus
                maxLength={100}
              />
            </label>
            <label>
              WebSocket address
              <Input
                name="url"
                placeholder="ws://192.168.1.10:4455"
                defaultValue={editing?.url ?? "ws://localhost:4455"}
                required
                spellCheck={false}
              />
            </label>
            <label>
              Saved password
              <Input
                name="password"
                type="password"
                defaultValue={editing?.password ?? ""}
                autoComplete="new-password"
                placeholder="Optional"
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="remember"
                defaultChecked={editing?.rememberPassword ?? false}
              />{" "}
              Remember password in this browser
            </label>
            <p className="field-help">
              Saved passwords are stored unencrypted in this browser.
            </p>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save connection</Button>
            </div>
          </form>
        )}
      </dialog>
      <dialog
        ref={passwordDialog}
        onCancel={() => setConnecting(null)}
        onClose={() => setConnecting(null)}
      >
        {connecting && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const password = String(
                new FormData(event.currentTarget).get("password") ?? "",
              );
              void connect(connecting, password);
            }}
          >
            <div className="dialog-heading">
              <h2>Connect to {connecting.name}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={() => setConnecting(null)}
              >
                <X />
              </Button>
            </div>
            <p className="dialog-description endpoint">{connecting.url}</p>
            <label>
              OBS WebSocket password
              <Input
                name="password"
                type="password"
                autoFocus
                autoComplete="off"
                placeholder="Leave empty if authentication is disabled"
              />
            </label>
            <p className="field-help">
              This password is used for this connection only.
            </p>
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConnecting(null)}
              >
                Cancel
              </Button>
              <Button type="submit">
                Connect <ArrowRight />
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </main>
  );
}
