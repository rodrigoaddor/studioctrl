# StudioCTRL

A desktop-first remote controller for OBS Studio Mode. React, TypeScript, Vite, React Router, Tailwind CSS, and shadcn/ui components. Connects directly using the OBS WebSocket v5 protocol through `obs-websocket-js`.

## Run locally

Use Bun 1.4.4 for dependency management and scripts. Node.js 22.12+ is required by the Vite and Vitest tooling.

```sh
bun install
mkcert -install
mkdir -p .cert
mkcert -key-file .cert/key.pem -cert-file .cert/cert.pem studioctrl.d.rodr.dev
bun run dev
```

Vite serves HTTPS using `.cert/cert.pem` and `.cert/key.pem`. The `.cert/` directory is ignored by Git; reuse an existing pair if already configured. Resolve `studioctrl.d.rodr.dev` to your development machine and open `https://studioctrl.d.rodr.dev:5173` (or Vite’s selected port). The supplied certificate covers that hostname; other hostnames need their own certificate coverage. Vite’s configured host allowlist is `.d.rodr.dev`, covering the domain and its subdomains.

In OBS, open **Tools → WebSocket Server Settings**, enable the server, and note its address and password (the default port is 4455). Add a connection in StudioCTRL with a `ws://` or `wss://` URL, then connect. An empty password works when authentication is disabled in OBS.

In **Add connection**, choose **Scan QR Code** to scan OBS’s connection QR with your camera, or use **Upload QR image** with a screenshot. Camera access needs a secure page and browser permission. Review the filled address/password, enter a connection name, and save. Enable **Remember password** explicitly if you want it stored; otherwise the app asks for it when connecting.

## Install as an app

PWA support is enabled in production builds, including local preview:

```sh
bun run build
bun run preview
```

Open the trusted HTTPS preview URL printed by Vite using the certificate hostname (`studioctrl.d.rodr.dev`). Use the browser’s install option (such as **Install app** in Chrome/Edge or **Add to Dock** in Safari). Installation availability depends on the browser; development mode does not register a service worker.

After the first successful load and service-worker installation, the app shell can open without the app server. OBS control always requires a reachable OBS WebSocket connection; a cached app opens disconnected. Saved profiles remain local to that browser/origin, and may need to be entered again in an installed app depending on browser storage behavior.

New releases show **Reload to update** with a **Later** option. Disconnect OBS in every open StudioCTRL window before accepting; updating can reload those windows. This window’s reload action stays disabled until disconnected. Reopen the app to check for a new release; closing all windows can also apply a waiting update.

Cloudflare Workers deployment is configured below. See the [PWA architecture contract](docs/architecture.md#pwa-and-application-updates) for cache behavior.

An HTTPS app may be blocked from connecting to plain `ws://` OBS endpoints by browser mixed-content or network-access rules. Use a browser-reachable `wss://` endpoint with trusted TLS where required (for example, a separately configured TLS terminator forwarding to OBS). PWA support does not provide that transport. Production hosting and the intended OBS network configuration still require [acceptance testing](docs/development.md#pwa-acceptance-checklist).

## Deploy to Cloudflare Workers

The app deploys as [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), using the existing Vite production build. `wrangler.jsonc` names the Worker `studioctrl`, serves `dist/`, and enables SPA fallback for routes such as `/studio`. No Worker entry-point script, Cloudflare Vite plugin, backend bindings, or application secrets are required.

```sh
bun install --frozen-lockfile
bun run deploy:check
bunx wrangler login
bun run deploy
```

`deploy:check` builds and performs a Wrangler dry run without uploading. `deploy` builds and publishes to the authenticated Cloudflare account. Rename the Worker in `wrangler.jsonc` before deployment if needed; no account ID or custom domain is committed. The first deployment uses your account’s `workers.dev` address. A custom domain can be added in Cloudflare afterward.

For Git-connected Workers Builds, set the repository root as the root directory, **Build command** to `bun run build`, and **Deploy command** to `bunx wrangler deploy`. Use Bun 1.4.4 (`packageManager` in `package.json`; optionally set `BUN_VERSION=1.4.4`) and Node.js 22.12+ (for example, `NODE_VERSION=22`). The Worker’s dashboard name must match `studioctrl` in the config. This separates the build and upload so CI builds once; `bun run deploy` is the combined local command. See [Cloudflare build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

`public/_headers` is copied into `dist/` to revalidate HTML entry points, the service worker, and manifest, while caching fingerprinted `/assets/*` files as immutable. `bun run preview:worker` builds and runs Wrangler’s local static-asset server without Cloudflare login or mkcert files; it prints a localhost HTTP URL. This is separate from the existing HTTPS Vite preview. Neither local preview publishes anything.

Cloudflare hosts the controller files; OBS traffic still goes directly from the operator’s browser to OBS. Verify the deployed HTTPS origin can reach the intended OBS address before relying on it for control.

## Documentation

- [Agent guidance](AGENTS.md): starting point and documentation maintenance requirements for future agents.
- [Milestones](docs/milestones.md): current implementation, outstanding acceptance, and deferred work.
- [Architecture](docs/architecture.md): OBS state, commands, synchronization, persistence, and implementation boundaries.
- [Preview research](docs/preview-research.md): OBS Blade’s screenshot approach and Program-output limitations.
- [Development](docs/development.md): tooling, automated checks, and live OBS acceptance checklist.

## Validation

```sh
bun run test
bun run build
```

Monitor settings offer No Preview or OBS Preview independently for Preview and Program, defaulting to No Preview and remembering each browser-local choice; Remote Preview is reserved for later. OBS Preview uses low-frame-rate scene screenshots, with the scene name as fallback. Scene buttons cache representative images locally in this browser. The Preview monitor can show a cached image at a constant 75% opacity while media is inactive or before useful playback. Scenes with an enabled native video capture device, or a playing network Media Source with unknown duration, use live OBS screenshots even when other media is unavailable; cached images remain a fallback if live screenshots are black or unavailable.

Tests use a simulated OBS WebSocket server and jsdom. See [development](docs/development.md) for coverage and verification limits; full browser/OBS acceptance remains outstanding.

Use the top-right **OBS actions** menu for **Refresh OBS state** or **Generate Previews**. Generation temporarily visits scenes on Preview and seeks media near five seconds, then restores Preview where possible. It skips media active on Program and never takes a scene to Program. Run it when temporarily changing Preview and starting media is appropriate. Missing thumbnails are also captured automatically as scenes naturally play past five seconds. Cached images persist across reloads; run generation again after changing scene content, or clear browser site data to remove them.
