# Development and verification

Use [README](../README.md) for initial setup, [architecture](architecture.md) for implementation boundaries, and [milestones](milestones.md) for authorized product direction and outstanding acceptance work.

## Tooling

Use the Bun version declared in `package.json` and commit dependency changes with `bun.lock`. Vite and Vitest currently use their standard Node-based CLIs through Bun scripts, so retain the Node requirement documented in README.

Use `bun install --frozen-lockfile` to verify an unchanged lockfile. Use `bun add` or `bun add -d` when dependencies change. Script definitions in `package.json` and configuration in `vite.config.ts` are the sources of truth for available commands and test discovery.

Run tests through `bun run test` so they use Vitest and the configured DOM environments. The command `bun test` invokes Bun's separate test runner.

Vite development and preview require the ignored mkcert pair described in [README](../README.md). Tests and production builds deliberately skip loading it, allowing CI and fresh checkouts to validate without private keys. When changing TLS configuration, verify an HTTPS response with the certificate’s hostname and confirm `.cert/` remains ignored.

Wrangler is a development dependency for Cloudflare Workers Static Assets. `bun run deploy:check` rebuilds and validates the deployment configuration locally without uploading or requiring login. `bun run preview:worker` rebuilds and serves the result using Wrangler on localhost; unlike Vite development/preview, this command does not load mkcert files. Wrangler state (`.wrangler/`) and local environment values (`.dev.vars*`, `.env*`) are ignored. Use the [README deployment instructions](../README.md#deploy-to-cloudflare-workers) for authentication and Workers Builds settings.

## Choosing verification

For implementation changes, run `bun run test` and `bun run build`. Add focused regression coverage for new behavior or fixed bugs where useful. Report failures or checks that could not run.

- `tests/obs.test.ts` uses a real local WebSocket server simulating OBS v5, including authentication. It covers top-to-bottom scene ordering at connection time and after `SceneListChanged`, alongside request ordering, events, session state, and failure behavior.
- `tests/reachability.test.ts` covers OBS Hello validation, unauthenticated probing, network failures, timeout, and cancellation using a controlled WebSocket double.
- `tests/connection-status.test.tsx` covers badge rechecks, unmount cleanup, and discarded results after URL edits.
- `tests/connections.test.tsx` uses Testing Library with jsdom for profile management, password forms, and independent per-profile reachability badges. Its dialog methods are shimmed; it does not prove native dialog focus or browser layout behavior.
- `tests/studio.test.tsx` covers dropdown selection versus explicit transition triggering, scene selection, independent Preview/Program indicators, busy-state guards, and the combined preview toggle with independent-menu synchronization and persisted settings.
- `tests/navigation.test.tsx` covers the single-session navigation contract, Exit, and connection-route redirects.
- `tests/screenshot-preview.test.ts` covers frame pacing, serialization, hidden tabs, backoff, and cancelled/stalled captures.
- `tests/screenshot-rendering.test.ts` covers decode-before-draw and obsolete frame rejection with controlled image/canvas doubles.
- `tests/obs-preview-hook.test.tsx` covers source/collection/mode lifecycle cleanup.
- `tests/scene-monitor.test.tsx` covers independent persisted mode settings, scene-name fallback, and the disabled Remote Preview option.
- `tests/profiles.test.ts` covers password persistence, malformed storage, and URL validation.
- `tests/pwa-update.test.tsx` covers explicit update acceptance, postponement, connection/session guards, and update-error feedback. These mocks do not validate browser service-worker lifecycle behavior.

The protocol simulator is a controlled test double, not OBS. Passing tests do not establish real transition timing, scene-collection behavior, or browser network compatibility. Record browser/OBS observations separately. For documentation-only changes, verify claims against code and check Markdown links; application tests need rerunning only when executable inputs change.

## Live OBS acceptance checklist

Use an OBS instance and reachable WebSocket address supplied for testing. Record OBS version, browser/version, operating system, network/address scheme, and the date in the milestone acceptance notes when this is performed.

1. Verify reachable OBS endpoints (including password-protected ones) show Online, unavailable endpoints show Offline, and badges update after endpoint availability changes. Save and edit a connection. Reload to confirm persistence. Verify passwords are omitted unless Remember password is enabled, and removed after opting out.
2. Connect with valid credentials, then verify clear feedback for invalid credentials and an unavailable endpoint. Confirm cancellation leaves no usable stale controls. While connected, confirm the brand link and Browser Back keep the active studio visible; **Exit** must disconnect and return to saved connections.
3. Start with Studio Mode disabled. Confirm the gate appears and connecting leaves OBS unchanged; enable it using the explicit button.
4. Compare scene order against the OBS Scenes dock at connection time and after reordering in OBS. Select scenes from the square button grid and confirm only Preview changes. Verify centered names, bottom state labels, and distinct Preview/Program borders. Check Program/Preview labels, including the case where both select the same scene.
5. Select Cut and Fade through the separate transition type dropdown, verifying that choosing an option changes the selected transition without taking Program. Trigger each using the centered Transition button. Verify the type selector and duration input align with the bottom of the monitors on desktop. Edit a non-fixed transition’s duration, commit with Enter or blur, and confirm OBS updates without taking Program. Verify external OBS duration changes appear in the field and fixed transitions disable editing. Confirm the selected OBS transition and resulting Program scene, using OBS's actual preview swap behavior. Test a stinger if available and confirm controls remain locked through playback.
6. Change scenes, names, Studio Mode, transition settings, and scene collection in OBS. Confirm the app catches up. Add a transition and verify the appbar refresh button reloads the list.
7. Exercise rapid changes and interrupted transitions. Record any stale selection or stuck busy state, including behavior around the 30-second fallback.
8. Stop OBS or interrupt the network, then reconnect through a saved profile. Verify old scene state clears and the new session is accurate.
9. Verify both monitors default to No Preview, save each monitor’s No Preview/OBS Preview choice independently, reload to confirm persistence, and check hover/focus overlay fading with its indicator, fade-out without a delay, the full-height settings button flush with the right edge, the live scene name at the top center, and the disabled Remote Preview entry. Observe screenshot smoothness, loading/error fallback, hidden-tab pause, and unchanged control responsiveness. Check same-scene Studio edits and transitions against actual Program output, accounting for the scene-screenshot limitation.
10. With enough scenes to show a page scrollbar, open/close dropdowns, change scene/transition/duration, toggle previews, and trigger validation/errors. Confirm the page, monitor area, and control positions stay stable, temporary synchronization does not dim scenes or controls or spin the refresh icon, and actions remain blocked while busy; the hover overlay may fade without changing geometry.
11. Inspect the desktop layout, keyboard navigation, dialogs/focus, long scene names, empty lists, and visible error feedback in the actual browser.

## PWA acceptance checklist

Use `bun run build` and `bun run preview` with the trusted local certificate, or a production HTTPS origin. `bun run dev` deliberately does not install a worker. The build should emit `manifest.webmanifest`, `sw.js`, a Workbox runtime, and the regular/maskable/Apple PNG icons. Regenerate committed icons after favicon changes with `bun run generate:icons` (uses the Sharp development dependency; generated PNGs are committed and normal builds do not regenerate them).

1. Inspect the manifest and service-worker registration in browser developer tools. Install from the browser menu; confirm the icon, standalone window, root startup, and route navigation. Record browser/version, OS, origin, and date.
2. Load once online and allow the worker to install. Close/reopen, then make the app server unavailable and open/reload `/` and `/studio`. Confirm the shell loads and starts disconnected, with no stale scenes or implied offline control. Verify a new connection fails honestly when OBS is also unreachable; app-server reachability and OBS reachability are separate.
3. Publish a second build with a visible change at the same origin, then reopen a window to trigger an update check. Confirm the release waits for **Reload to update**, **Later** keeps the current page, and connecting/connected states disable reload. Disconnect all windows, accept, and verify the new build loads. Repeat with multiple app windows and check activation after all windows close. Inspect cache cleanup after activation.
4. Verify the installed app can connect over the intended network and OBS address scheme, including browser permission prompts and WS/WSS restrictions. Interrupt OBS connectivity and confirm disconnected state and reconnect behavior. Cached assets must not hide an OBS connection failure.
5. Run `bun run deploy:check`. Use `bun run preview:worker` to confirm JavaScript for `sw.js`, the manifest media type for `manifest.webmanifest`, navigation fallback for `/studio` and `/studio/`, `no-cache` on entry files/routes, and immutable caching for fingerprinted `/assets/*`. Vite preview does not apply `_headers`. Repeat against the deployed origin. Exercise clients still loading the previous release during rollout; the current deploy scripts upload only the current `dist/` and do not retain previous fingerprinted files.

Automated tests cover the update UI, and the production build validates service-worker generation. They do not prove installation, offline startup, multi-window activation, or deployment/network compatibility; record that evidence in [milestones](milestones.md) only after exercising it.

## Documentation completion

Follow the maintenance rule in [AGENTS.md](../AGENTS.md) for every relevant change. Update the owning document alongside implementation and keep implemented facts distinct from future proposals. Record test coverage and validation gaps rather than a test count that becomes stale. Update milestone acceptance only with evidence from the checks actually performed.
