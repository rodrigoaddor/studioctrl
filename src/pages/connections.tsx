import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScanQrCode } from "../components/scan-qr-code";
import { ErrorNotice } from "../components/error-notice";
import { ConnectionCard } from "../components/connection-card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PasswordInput } from "../components/password-input";
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
  const addressInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
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
    <main className="mx-auto w-[calc(100%-3rem)] max-w-[1200px] py-6 max-[720px]:w-[calc(100%-2rem)] max-[720px]:py-4">
      <div className="mb-5 flex items-center justify-between gap-4 max-[720px]:gap-3">
        <h1 className="font-heading m-0 text-xl leading-[1.3] font-semibold tracking-[-0.5px]">
          Connections
        </h1>
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
        <ErrorNotice message={error} onDismiss={() => setError("")} />
      )}
      <div className="grid grid-cols-3 gap-3 max-[1000px]:grid-cols-2 max-[720px]:grid-cols-1">
        {profiles.map((p) => (
          <ConnectionCard
            key={p.id}
            profile={p}
            disabled={status === "connecting"}
            connecting={status === "connecting" && active?.id === p.id}
            connected={status === "connected" && active?.id === p.id}
            onConnect={() =>
              active?.id === p.id && status === "connected"
                ? navigate("/studio")
                : startConnect(p)
            }
            onEdit={() => {
              setEditing(p);
              setError("");
              setFormOpen(true);
            }}
            onDelete={() => {
              if (window.confirm(`Delete “${p.name}”?`))
                persist(profiles.filter((old) => old.id !== p.id));
            }}
          />
        ))}
        {profiles.length === 0 && (
          <section className="col-span-full border border-dashed border-border p-6 text-center">
            <h2 className="font-heading m-0 text-sm font-medium">No saved connections</h2>
            <p className="mt-2 text-xs leading-[1.6] text-muted-foreground">
              Add an OBS WebSocket connection.
            </p>
          </section>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Enable the server in OBS under Tools → WebSocket Server Settings.
      </p>
      <dialog
        className="m-auto w-[calc(100%-2rem)] max-w-[440px] border border-border bg-popover p-5 text-popover-foreground shadow-[0_12px_40px_#0004] backdrop:bg-black/50"
        ref={dialog}
        onCancel={() => setFormOpen(false)}
        onClose={() => setFormOpen(false)}
      >
        {formOpen && (
          <form onSubmit={save} key={editing?.id ?? "new"}>
            <div className="flex items-center justify-between gap-2.5">
              <h2 className="font-heading m-0 text-base font-medium">
                {editing ? "Edit connection" : "New connection"}
              </h2>
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
            {!editing && (
              <ScanQrCode
                onScan={({ url, password }) => {
                  if (addressInput.current) addressInput.current.value = url;
                  if (passwordInput.current)
                    passwordInput.current.value = password;
                  setError("");
                }}
              />
            )}
            <label className="mt-4 flex flex-col gap-[7px] text-xs">
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
            <label className="mt-4 flex flex-col gap-[7px] text-xs">
              WebSocket address
              <Input
                ref={addressInput}
                name="url"
                placeholder="ws://192.168.1.10:4455"
                defaultValue={editing?.url ?? "ws://localhost:4455"}
                required
                spellCheck={false}
              />
            </label>
            <label className="mt-4 flex flex-col gap-[7px] text-xs">
              Saved password
              <PasswordInput
                ref={passwordInput}
                name="password"
                defaultValue={editing?.password ?? ""}
                autoComplete="new-password"
                placeholder="Optional"
              />
            </label>
            <label className="mt-4 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                name="remember"
                defaultChecked={editing?.rememberPassword ?? false}
              />{" "}
              Remember password in this browser
            </label>
            <p className="mt-2 text-[11px] leading-[1.6] text-muted-foreground">
              Saved passwords are stored unencrypted in this browser.
            </p>
            {error && (
              <ErrorNotice message={error} onDismiss={() => setError("")} />
            )}
            <div className="mt-5 flex justify-end gap-2">
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
        className="m-auto w-[calc(100%-2rem)] max-w-[440px] border border-border bg-popover p-5 text-popover-foreground shadow-[0_12px_40px_#0004] backdrop:bg-black/50"
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
            <div className="flex items-center justify-between gap-2.5">
              <h2 className="font-heading m-0 text-base font-medium">
                Connect to {connecting.name}
              </h2>
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
            <p className="mt-2 mb-4 font-mono text-xs text-muted-foreground wrap-anywhere">
              {connecting.url}
            </p>
            <label className="mt-4 flex flex-col gap-[7px] text-xs">
              OBS WebSocket password
              <PasswordInput
                name="password"
                autoFocus
                autoComplete="off"
                placeholder="Leave empty if authentication is disabled"
              />
            </label>
            <p className="mt-2 text-[11px] leading-[1.6] text-muted-foreground">
              This password is used for this connection only.
            </p>
            <div className="mt-5 flex justify-end gap-2">
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
