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

Monitor settings offer No Preview, OBS Preview, or Remote Preview independently for Preview and Program, defaulting to No Preview and remembering each browser-local choice. OBS Preview uses low-frame-rate scene screenshots, with the scene name as fallback. Scene buttons cache representative images locally in this browser. The Preview monitor can show a cached image at a constant 75% opacity while media is inactive or before useful playback. Scenes with an enabled native video capture device, or a playing network Media Source with unknown duration, use live OBS screenshots even when other media is unavailable; cached images remain a fallback if live screenshots are black or unavailable.

Tests use a simulated OBS WebSocket server and jsdom. See [development](docs/development.md) for coverage and verification limits; full browser/OBS acceptance remains outstanding.

OBS state synchronizes automatically. The top-right **OBS actions** menu’s **Scenes** submenu contains **Generate Previews**, **Reset Previews**, and **Show hidden scenes**. Generation temporarily visits scenes on Preview and seeks media near five seconds, then restores Preview where possible. It skips media active on Program and never takes a scene to Program. Run it when temporarily changing Preview and starting media is appropriate. Missing thumbnails are also captured automatically as scenes naturally play past five seconds. Cached images persist across reloads; run generation again after changing scene content, or use **Reset Previews** to clear saved thumbnails for the current connection’s scene collection, including hidden scenes. Reset leaves OBS and monitor settings unchanged; automatic capture or generation can populate fresh images afterward. Other collections keep their images.

## Remote Preview (WebRTC / MediaMTX)

Publish OBS to MediaMTX first. Open either monitor’s settings → **Remote Preview**, enter the stream’s WebRTC URL (for example `https://media.example.com/mystream/whep`), choose None, Username and password, or Bearer token authentication, then **Save and connect**. A MediaMTX stream page URL also works; the app appends `/whep`. Use the WebRTC read endpoint, not the OBS publishing/WHIP or RTMP URL. The credentials need read permission for that path. After setup, choosing **Remote Preview** switches directly to the saved feed. Use the separate **Configure Remote Preview…** action below the source choices to edit settings from any mode; **Save and connect** selects Remote Preview, while Cancel leaves playback/settings unchanged. Failures show feedback and a Retry button.

Settings are independent per OBS connection profile and monitor. URLs, authentication type, and username persist locally. Passwords/tokens stay in memory for the current page unless **Remember credentials** is checked; remembered credentials are stored without encryption. After reloading, reopen the dialog to reenter credentials that were not remembered. Show/Hide Previews restores the last enabled source for each monitor.

Playback always starts muted, including after switching back to Remote Preview, reconnecting, or retrying. Hover over either remote video with a mouse, or tap it on touch devices, to reveal a vertical volume slider above the mute button in the bottom-right corner. Each monitor has a separate header above its picture showing its label, scene name, settings, and an expand button to the right of settings. Expand stays visible; only volume overlays the remote video. Mouse movement reveals volume and resets its inactivity timer; mouse clicks keep it visible. A single touch tap reveals volume, even when focus was elsewhere. The expand button opens that monitor in a large dialog, with its Preview/Program label, scene name, and settings in a separate header above the video. Escape or the collapse button returns it to the controller without reconnecting or changing its audio state. This works independently of the app’s fullscreen mode. The controls fade in and out over 200ms; tap the video again on touch devices to begin hiding them immediately. The icon reflects low, medium, or high volume and shows a crossed-out speaker while muted. The controls use a 50%-black background and hide after three seconds of inactivity, staying visible while dragged or keyboard-focused. Focus left by a touch or mouse gesture does not prevent hiding. Mute and volume changes do not reconnect the stream. Mute and volume are local to each player; neither is saved. Volume is retained while that player is mounted and starts at 100% on a new player. Keyboard users can focus the video surface to reveal the controls, then Tab to the mute button and volume slider. If the browser blocks playback with sound, click **Play stream**. Remote Preview displays the published feed, usually **Program**, even in the Preview monitor. Selecting scenes does not change which stream is received. A separate actual Preview feed requires a separately published stream; this app does not configure OBS outputs or MediaMTX.

The browser must reach both the WebRTC HTTP endpoint and the advertised ICE addresses. For this HTTPS app, use a trusted HTTPS MediaMTX endpoint/reverse proxy. Set MediaMTX’s `webrtcAllowOrigins` to allow the controller’s origin, configure `webrtcAdditionalHosts` for addresses reachable by the browser, and expose the configured ICE UDP/TCP ports or configure TURN as needed. Proxies must pass OPTIONS/POST/DELETE, Authorization, and SDP, and expose the `Link` and `Location` response headers through CORS. The player uses server-advertised STUN/TURN and a complete ICE offer (no trickle PATCH). Choose browser-compatible codecs; H.264 video and Opus audio are a useful starting point. Other transports, custom client ICE configuration, and automatic retries are outside this implementation.

See MediaMTX’s [browser embedding](https://mediamtx.org/docs/read/web-browsers), [authentication](https://mediamtx.org/docs/features/authentication), and [WebRTC connectivity](https://mediamtx.org/docs/features/webrtc-specific-features) documentation. Targeted unauthenticated MediaMTX playback passed in Chromium, including from the local app origin; authenticated playback and full monitor/network acceptance remain for local testing. See [milestone evidence](docs/milestones.md#m3--preview-and-program-video).
