# Architecture and implementation contracts

This file describes current implementation. Future capabilities and their status belong in [milestones](milestones.md).

## Application boundaries

The app is a browser-only SPA. It maintains one active OBS controller session at a time, using WebSocket v5, with RPC version 1 and the JSON build of `obs-websocket-js`. There is no application backend, account system, proxy, or external video transport. A production-only service worker caches the application shell. OBS scene previews use repeated WebSocket screenshots.

| Boundary | Responsibility |
| --- | --- |
| `src/lib/obs.ts` | `StudioClient`: WebSocket lifecycle, OBS requests/events, state snapshots, synchronization, command guards, and errors. |
| `src/context.tsx` | One client per provider; React subscribes through `useSyncExternalStore`. |
| `src/lib/reachability.ts` | Short-lived, unauthenticated OBS Hello probes with timeout and cancellation. |
| `src/components/preview-toggle.tsx` | Text-only Show/Hide Previews button above transitions; enables or disables both monitors together. |
| `src/hooks/use-monitor-mode.ts` | Shared reactive monitor preferences used by individual menus and the combined toggle. |
| `src/components/transition-duration.tsx` | Validated millisecond duration editor, committed on blur or Enter. |
| `src/components/transition-control.tsx` | Centered control group with a taller Transition action and transition settings dropdown. |
| `src/components/scene-button.tsx` | Square scene tile with centered name, bottom selection labels, and state-driven border colors. |
| `src/components/scene-monitor.tsx` | Shared 16:9 monitor, settings dropdown, screenshot canvas, and fallback states. |
| `src/hooks/use-obs-preview.ts` | React lifecycle and source-generation guards for monitor playback. |
| `src/lib/screenshot-preview.ts` | Sequential capture/decode pacing and canvas presentation. |
| `src/lib/monitor-settings.ts` | Per-profile, per-monitor browser-local preview mode preferences. |
| `src/components/connection-status.tsx` | Per-profile reachability badge and automatic rechecks while mounted. |
| `src/components/scan-qr-code.tsx` | Add-connection camera/image QR scanner with media lifecycle cleanup. |
| `src/lib/obs-qr.ts` | OBS QR payload validation and credential extraction. |
| `src/lib/profiles.ts` | Profile schema, URL normalization, and browser-local persistence. |
| `src/pages/connections.tsx` | Profile forms, password prompt, connection selection, and navigation after connection. |
| `src/pages/studio.tsx` | Studio Mode gate, current scenes, Preview selection, and transition controls. |
| `src/components/error-notice.tsx` | Dismissible fixed-position error feedback that does not push page or dialog content. |
| `src/App.tsx` | Shared shell, Exit, connection status, manual refresh, global errors, and route definitions. |
| `src/components/pwa-update.tsx` | Service-worker registration and explicit application update prompt, mounted alongside the app inside the provider. |
| `src/components/ui/` | Generated shadcn/ui primitives using the configured preset. `components.json` configures future additions. |
| `src/index.css` | Tailwind/shadcn imports, theme tokens, dark-mode variant, and shared base integration. |

Routes use React Router's `BrowserRouter`: `/` manages connections and `/studio` displays the controller. The studio route returns to connections without an active session. During an active connection, the connections route redirects to the studio and the brand link stays in the studio. The single **Exit** button disconnects and returns to connections; saved profiles remain available for the next session. Browser Back cannot open the connection manager while a session remains active. Static hosts need an `index.html` fallback for client routes.

## Local HTTPS

`vite.config.ts` loads `.cert/key.pem` and `.cert/cert.pem` relative to the config file when running a server outside test mode. Development and Vite preview use this local TLS configuration; tests and production builds do not read or require the certificate files. `/.cert/` is ignored by Git.

The configured `server.allowedHosts` is `[".d.rodr.dev"]`, inherited by preview. This permits `d.rodr.dev` and its subdomains in Vite’s hostname matching. Vite skips that check under HTTPS, so the allowlist is configuration, not HTTPS host enforcement. The supplied certificate covers `studioctrl.d.rodr.dev`; DNS resolution and certificate trust are configured on the development machine. See [README](../README.md) for local setup and [Vite server options](https://vite.dev/config/server-options.html#server-allowedhosts) for hostname matching behavior.

## PWA and application updates

`vite-plugin-pwa` generates the root-scoped manifest and Workbox service worker during production builds. The browser title and manifest name/short name are StudioCTRL. The manifest uses standalone display, starts at `/`, and supplies PNG icons at 192/512 pixels, a separate maskable icon, and an Apple touch icon. The icons derive from the existing Cast favicon; `scripts/generate-pwa-icons.ts` regenerates them using Sharp (`bun run generate:icons`). Development service workers are disabled; use a production build and preview for PWA validation.

Workbox precaches built JS, CSS, HTML, bundled fonts, and icons. Navigation fallback serves the cached shell only for `/` and `/studio` (including its trailing slash). There are no runtime caching rules for external resources, OBS connections, credentials, screenshots, or OBS state. Profiles and preferences remain in localStorage under their existing contracts. Opening a cached shell starts disconnected and requires a new live OBS connection; shell availability does not establish OBS reachability.

Updates use `registerType: "prompt"`, with no automatic skip-waiting or client claiming. `PwaUpdate` offers **Reload to update** and **Later** when a release is waiting. Reload is disabled while this window is connecting or connected, and errors remain in the update notice. Updates may reload other open app windows, so the notice instructs the operator to disconnect OBS in each window before accepting. Closing all app windows can also allow a waiting worker to activate normally. Registration checks for updates when the app opens; there is no periodic update polling.

Host the built app at the origin root over trusted HTTPS with SPA rewrites for client routes. Serve `sw.js`, `index.html`, and `manifest.webmanifest` with revalidation (`Cache-Control: no-cache`); fingerprinted assets can use long-lived immutable caching. The service worker must be served as JavaScript, never rewritten to HTML. A valid secure app origin does not bypass browser WebSocket mixed-content or local-network restrictions; the intended OBS endpoint must be tested separately.

## Cloudflare Workers hosting

`wrangler.jsonc` configures an assets-only Worker named `studioctrl` with `assets.directory: "./dist"` and `not_found_handling: "single-page-application"`. Vite still owns the client build; there is no Worker entry point, Cloudflare Vite plugin, asset binding, or server runtime logic. The existing browser-to-OBS connection remains direct. Account selection and authentication belong to Wrangler/CI, not the committed application config. Custom domains are not configured in the repository.

`public/_headers` is copied to the build output and interpreted by [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/headers/). `/`, `/index.html`, `/studio`, `/studio/`, `/sw.js`, and `/manifest.webmanifest` receive `Cache-Control: no-cache`; fingerprinted `/assets/*` receive `public, max-age=31536000, immutable`. Other assets use Cloudflare’s defaults. `_headers` is hosting metadata and is not part of the service-worker precache. Vite preview does not interpret these hosting rules; use Wrangler to check them.

`deploy` builds then uploads with Wrangler; `deploy:check` builds then runs a local deployment dry run. `preview:worker` builds and starts Wrangler locally without the mkcert configuration. No script automatically deploys on build. Each deployment uploads the current `dist/`; the repository does not implement retention of previous fingerprinted files. Verify a two-release rollout with open windows and cached clients before production acceptance, including clients still loading an older release.

## UI theme and density

Use shadcn/ui preset `b1Zirub0S`: Lyra style, mist base, blue theme/chart colors, Lucide icons, Inter font, default radius, and subtle menu accents. The component base is Radix (`radix-lyra` in `components.json`). Button, Input, ButtonGroup, and DropdownMenu come from that preset; Inter is bundled through `@fontsource-variable/inter`. Headings use the `font-heading` utility; the shadcn/ui heading font token (`--font-heading`) uses Outfit bundled through `@fontsource-variable/outfit`. The shared monospace font (`font-mono`) is JetBrains Mono bundled through `@fontsource-variable/jetbrains-mono`.

Style layouts and components directly with Tailwind utilities, including responsive, focus, disabled, dialog backdrop, and selected-state variants. Keep `src/index.css` limited to theme/base integration and exceptional styles that Tailwind cannot reasonably express, such as complex custom animations. Reuse components for recurring UI patterns instead of introducing CSS classes that bundle ordinary utilities.

Theme variables in `src/index.css` own the palette. Preview/Program tokens are exposed through Tailwind color utilities such as `text-preview`, `text-program`, `border-preview`, and `border-program`. Scene tiles use a 3px Preview border or Program border (2px for unselected tiles); when selected for both, they retain the Program border and add a Preview ring. `aria-pressed` represents Preview selection, while both labels remain independently visible. Application surfaces use those variables; Preview and Program retain separate semantic status colors. The app currently defaults to dark mode through the root HTML class. `tsconfig.json` and `tsconfig.app.json` expose the `@/*` alias for the shadcn CLI and application respectively; Vite resolves it at runtime.

Keep the interface compact and functional: a 56px (`h-14`) appbar, 24px desktop main padding, concise page headings, and no promotional copy or footer. The appbar centers the StudioCTRL logo, rendered as lowercase 18px studio and uppercase 12px CTRL in Inter with a 4px gap and a shared baseline, using equal-width side columns, with Exit using Lucide ChevronLeft (Cancel while connecting) on the left. Only the connected studio shows connection status followed by an icon-only **Refresh OBS state** button on the far right; the connections page omits both controls. Refresh reloads OBS state. During synchronization it keeps its normal appearance and static icon, exposes `aria-disabled`, and ignores repeat clicks. The connected status reads “Connected to [profile name]”, truncating long names within the right appbar column. The studio content starts directly with the monitors (or Studio Mode gate), without a separate profile-name heading, server-address row, or Sync button. Use Lucide Cast for the app icon and `public/favicon.svg`; the favicon uses the same Lucide SVG geometry.

Preview and Program use shared `SceneMonitor` panels with `aspect-video` (16:9) and a black video surface. The full-width `bg-black/60` overlay contains the Preview/Program indicator on the left and a 36px (`size-9`) settings button on the right, filling the bar height and flush with the corner. The settings button is flat and borderless, uses the same subtle fill on hover, keyboard focus, and when open, and suppresses the shared button’s focus border/ring to keep all three states flat. The entire bar stays visible at all times, without hover/focus gating or opacity animations. During live playback, the scene name appears centered in this overlay instead of in the middle of the image. Each offers No Preview and OBS Preview; Remote Preview is disabled and has no action. The current scene name stays centered when disabled, loading, or unavailable. Long names wrap and clamp inside the panel.

On desktop, the transition section stretches to the monitor row height. Its shared `w-40` (160px) column stretches Show/Hide Previews, Transition, and the transition settings button to the same full width. A three-row grid with automatic row heights centers the whole control group vertically. The standalone **Transition** action is 56px tall, with 24px gaps separating it from the text-only **Show Previews** / **Hide Previews** button above and the combined transition settings button below. The preview toggle shows Hide Previews when both monitors use OBS Preview and Show Previews otherwise; clicking disables both if both are enabled, or enables both from an off/mixed state. During transient OBS busy/sync states, scene and transition actions keep their normal appearance and DOM nodes while `aria-disabled` and event guards block repeat actions. The duration field becomes read-only rather than disabled; no loading row or screen overlay is inserted. Preview availability remains independent of transition busy state.

The combined transition settings button shows OBS's selected transition and its editable duration; at widths of 600px and below the duration summary is hidden to preserve space for the name. Its dropdown matches the trigger width, including on narrow layouts, and contains radio items for available transitions, a separator, and a shadcn/ui Input Group containing a Lucide Clock icon, the duration input, and an ms suffix. The numeric duration input hides native spinner arrows while retaining number validation and keyboard stepping. The duration group is borderless and has no extra outer padding; the dropdown frame and separator define the row. Keyboard focus uses a subtle row background. The input retains an accessible duration label without a separate visible heading. Selecting a transition updates OBS without taking Preview to Program and closes the menu. Only **Transition** triggers the selected type. The millisecond duration input inside the dropdown applies integers from 50 to 20,000 on blur or Enter via `SetCurrentSceneTransitionDuration`, without triggering a transition. It is read-only during busy/syncing. Fixed-duration transitions such as Cut (`duration === null`) omit the duration summary, separator, and duration editor entirely. While the dropdown is open, the existing input node synchronizes to OBS state before paint when the selected transition or reported duration changes, without remounting. Editing keys are isolated from menu navigation/typeahead; Escape still closes the menu. Invalid edits show validation feedback below the input inside the dropdown; no empty validation space is reserved for valid values. Closing the menu discards uncommitted local drafts; blur or Enter commits valid changes. At 900px and below, the monitors remain side by side and the controls form a full-width, three-column row beneath them: Show/Hide Previews on the left, Transition centered, and the combined transition settings button on the right. Equal-width columns keep Transition centered regardless of the side controls; each group stays at most 160px wide and is vertically centered in the row.

Scene order follows OBS’s Scenes dock from top to bottom: `GetSceneList` is returned bottom-to-top, so the client sorts by descending `sceneIndex` before storing names. Apply this normalization on every refresh, including `SceneListChanged`, so startup, manual refresh, and OBS reordering stay consistent.

The shared application shell uses `min-h-dvh` so its minimum height follows the visible viewport as browser toolbars appear or disappear; content can still scroll vertically when needed.

The scenes Scroll Area applies shadcn's `scroll-fade-x` utility to its viewport. The utility comes from the existing `shadcn/tailwind.css` import: supporting browsers track the horizontal scroll position; browsers without scroll-driven animations use the utility's static edge-fade fallback.

Scenes occupy one horizontally scrollable row beneath both monitors, using shadcn/ui Scroll Area with a hidden horizontal ScrollBar, fixed 132px columns, and `aspect-square` tiles. The horizontal ScrollBar stays mounted to enable Radix's horizontal viewport scrolling, but has no visible track or thumb. The visible section header is omitted; the section retains its accessible Scenes label. Row padding leaves room for selection rings and keyboard focus outlines. Names are centered; Preview/Program text is centered along the bottom. Long names wrap and clamp, with full names available through the title and accessible label. Preview uses saturated green and Program uses vivid red, with a larger brightness difference in the default dark theme; independent text labels also identify each state. Scene and transition actions remain guarded while busy or syncing without transient dimming or focus loss.

To reapply or change the preset, use the shadcn CLI, then inspect generated components and CSS so existing application rules do not override the theme. The preset was applied with `bunx shadcn@latest init --preset b1Zirub0S --base radix --force --no-reinstall --yes`, followed by `bunx shadcn@latest add button input --overwrite --yes`.

## Stable control layout

Ordinary control-state updates must not move surrounding content or flash transient disabled styling. Use `aria-disabled` with explicit event guards for temporary busy/sync states, read-only for the duration field, and native disabled styling for genuinely unavailable controls. Automatic synchronization never spins or dims the appbar refresh icon. Shared buttons, inputs, and scene tiles change appearance instantly; buttons have no pressed translation. Dropdowns are non-modal by default, open without fade/zoom/slide animations, and keep page scrolling available instead of applying Radix scroll locking. The root reserves a stable scrollbar gutter so vertical overflow changes do not recenter the page.

Connection status badges have a fixed width and height across Checking/Online/Offline. Error notices are dismissible fixed overlays rather than page/dialog rows. Duration validation appears inside the open settings menu, while empty-transition feedback is positioned below its trigger outside normal flow; neither moves the centered Transition action. Preview panels and scene tiles keep their existing fixed aspect ratios; their frame, loading, and selection overlays stay outside normal flow.

Intentional changes such as navigation or adding/removing scenes still change the content. Verify real layout stability in a browser, especially with a visible page scrollbar; DOM tests cover menu behavior but do not measure pixels.

## OBS is the authority

Program is the current output scene; Preview is the prepared next scene in Studio Mode. A scene can occupy both. Keep their indicators independent.

`selectScene` calls `SetCurrentPreviewScene`. `selectTransition` calls `SetCurrentSceneTransition` without triggering any scene change, and refreshes state through the shared command lifecycle. `transition` calls `SetCurrentSceneTransition` before `TriggerStudioModeTransition`; this also changes the transition selected in OBS. `setTransitionDuration` validates the protocol range and updates OBS through the shared guarded command lifecycle. Duration and other transition behavior remain OBS-authoritative, including any OBS-side configuration that affects the result.

Connecting does not enable Studio Mode. `enableStudio` explicitly calls `SetStudioModeEnabled`. Studio-dependent commands are guarded in the client as well as disabled in the UI. Busy and syncing states also block commands.

## Synchronization and lifecycle

Connection state is `disconnected`, `connecting`, or `connected`; connection success and initial synchronization are separate operations. The client subscribes to scene selections, scene list/name changes, Studio Mode, scene collection changes, and current transition settings. These events request full state refreshes rather than maintaining separate optimistic scene state in React.

Refreshes share an in-flight promise and coalesce additional requests into another pass. A revision counter and client identity prevent outdated responses from overwriting a newer snapshot. Commands wait for refresh completion before returning. Collection changes clear scene selections while the new collection loads.

Transition start events lock controls. `SceneTransitionVideoEnded` unlocks them and refreshes state; `SceneTransitionEnded` alone can represent the cut point of a stinger rather than the end of playback. An app-triggered transition has a 30-second fallback that unlocks and refreshes if completion was not observed. Preserve the distinction when changing transition logic.

Disconnect clears scene state and timers. Intentional disconnect removes the old client's listeners; callbacks and asynchronous commands check client identity. Authentication failures receive a password-specific error. Reload and dropped connections require the operator to connect again.

## Screenshot previews

Each monitor defaults to No Preview and stores its mode independently under `studioctrl.monitor.v1:<profileId>:<preview|program>` in localStorage. Only `none` and `obs` are accepted; invalid/missing preferences default to No Preview. Explicitly saved OBS Preview choices remain enabled across reloads; changing the default does not overwrite them. The individual menus and combined toggle subscribe through `useSyncExternalStore` to the shared monitor settings module. Same-tab writes notify all subscribers, and browser storage events synchronize other tabs. Combined writes save both choices before notifying. Storage failures retain shared in-memory preferences for the current page lifetime. Frames and screenshots are never persisted.

`StudioClient.getScreenshot(sceneName)` uses the existing authenticated connection and calls `GetSourceScreenshot` with JPEG (`jpg`), width 640, and compression quality 65; height is omitted to preserve the scene's aspect ratio. It shares concurrent requests for the same source and permits at most two pending screenshot requests in the current session/collection generation. Capture is independent of command `busy`/`syncing`, and failures stay local to the monitor rather than replacing the global control error.

Each enabled monitor runs a sequential loop capped at 10 FPS: capture, decode a candidate image off-screen, draw it to the canvas, then wait for the remainder of the 100ms frame period. Canvas pixels remain visible during decoding; image data is kept outside React's shared state. Decoded candidate resources are released after drawing, and the canvas uses `object-contain` to fit non-16:9 scenes without distortion. Failures show the scene-name fallback and retry with a 1–5 second exponential backoff. A capture/decode taking over three seconds shows the unavailable fallback while waiting for that operation; it does not enqueue replacement calls.

Hidden tabs stop requesting new frames and recheck visibility every 250ms. No Preview, missing scenes, disabled Studio Mode, Exit, and unmount stop the loop. Source changes hide the previous image immediately; an AbortSignal prevents obsolete replies/decodes from drawing. `previewEpoch` invalidates same-name scenes across connections and collection changes. Session/collection invalidation rejects pending screenshot wrappers and clears their cache; already-sent OBS requests cannot be cancelled on the wire, so late results are discarded. The next frame starts only after the previous capture and decode settle.

These are **scene screenshots**, including for the Program monitor. They are not a direct Program-output feed: transition effects and uncommitted same-scene Studio edits can differ from the actual output. This limitation is available in the monitor indicator tooltip. See [preview research](preview-research.md) for OBS Blade's approach, primary sources, and the distinction between scene capture and output monitoring. Remote streams remain deferred.

## Profiles and passwords

Profiles are stored under `studioctrl.connections.v1` in localStorage with `id`, `name`, `url`, `rememberPassword`, and an optional `password`. Valid URLs use `ws://` or `wss://`, with no embedded credentials or fragment. Loading tolerates malformed storage and filters invalid entries.

Only explicitly remembered passwords are persisted; opting out removes the password on save. Non-remembered passwords are requested when connecting. The live session snapshot omits the profile password. Remembered passwords are stored without encryption, as disclosed by the connection form.

The add-connection form offers **Scan QR Code** using `qr-scanner` for camera capture or a local image/screenshot. Decoding stays in the browser; images and raw QR payloads are not persisted. `parseObsQr` accepts `obsws://host:port/password` and `obswss://host:port/password`, maps them to `ws://`/`wss://`, validates the host and port, and percent-decodes the password. The password segment is optional for authentication-disabled OBS. This follows [OBS QR generation](https://github.com/obsproject/obs-websocket/blob/master/src/forms/ConnectInfo.cpp). Scan errors never echo the credential-bearing payload.

A valid scan fills only the address and password for review; it does not save, connect, or enable password remembering. Camera capture starts only after the Scan action and is stopped on success, cancellation, dialog close, or unmount, including permission requests that settle after cleanup. Camera failures leave local image upload and manual entry available. Camera access requires browser permission and a secure context.

Changes to the persisted schema need an explicit migration/compatibility decision. Keep credential handling within the profile and connection boundaries.

## Saved connection reachability

Each connection card shows a top-right Checking, Online, or Offline badge. `isObsOnline` opens a temporary JSON WebSocket and requires a valid OBS Hello (opcode 0, a WebSocket version string, and RPC version at least 1) within five seconds. It then closes the socket. The probe sends no Identify message, credentials, or OBS commands, so it works with password-protected endpoints without creating additional controller sessions.

Badges check immediately on mount or URL change and schedule another check 15 seconds after each completed check. They keep the last result visible during rechecks. Results stay in component state, not saved profiles. URL edits and leaving/deleting a card cancel its pending probe and recheck timer; outdated results are ignored.

Online means an OBS endpoint is reachable from this browser, not that its password is correct or Studio Mode is enabled. Offline also covers timeouts, non-OBS endpoints, and browser/network restrictions. Connect remains available regardless of the badge result; authentication and session setup still happen only after the operator chooses Connect.

## Current limitations to consider when changing behavior

- Newly configured transitions can be loaded with the appbar refresh button; there is no transition-list event subscription.
- Synchronization errors are displayed and release the syncing flag; the previous snapshot may remain visible. A connected status alone does not prove a fresh snapshot.
- The fallback timeout can unlock controls during unusually long transitions. Externally started transitions rely on the video-end event for unlocking; interrupted transitions require real OBS validation.
- Scene selections are tracked by names, not UUIDs. Renames trigger a refresh.
- Validation includes a simulated OBS protocol server, DOM tests, and a targeted read-only scene-order check against real OBS. Full OBS/browser acceptance remains outstanding; see milestone acceptance notes.

Consult the [OBS protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md) and [client documentation](https://github.com/obs-websocket-community-projects/obs-websocket-js) when changing protocol interactions. Installed types and the current implementation remain the immediate references for supported calls.
