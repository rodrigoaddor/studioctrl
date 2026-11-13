# Milestones

This file owns product scope, decisions, milestone status, and deferred work. See [architecture](architecture.md) for implementation contracts and [development](development.md) for validation procedures.

## Product direction and settled decisions

- Build for larger screens first. Phone-first layouts are outside the initial target. Keep the interface compact with concise functional copy and no promotional sections or footer.
- Use a client-rendered React application with Vite, TypeScript, Tailwind CSS, editable shadcn/ui components, and simple React Router routes. SSR is unnecessary for the current scope.
- Keep control-state changes stable in layout: no press movement or layout-changing loading/error rows. Monitor overlays remain visible at all times.
- Use Tailwind utilities for application styling; reserve CSS for theme/base integration and styles that utilities cannot reasonably express.
- Use Bun for dependencies and script execution.
- Connect directly to the OBS built-in WebSocket server. The operator supplies a reachable address, potentially through a network such as Tailscale.
- Operate only in Studio Mode. If disabled, offer an explicit enable button; connecting alone must not enable it.
- Keep one active OBS session at a time. **Exit** disconnects and returns to the connection manager; managing multiple simultaneous sessions is outside scope.
- Save connection profiles locally. Remembering a password is an explicit option, off by default.
- The controller includes scene selection, configurable OBS screenshot previews, and production PWA support. Cloudflare Workers Static Assets is the configured hosting target; production deployment and network acceptance remain outstanding. Remote streams remain deferred. Local development HTTPS uses an ignored mkcert certificate.

## M1 — Base controller

**Status: implemented; live OBS acceptance remains outstanding.**

Delivered scope:

- Connection page with profile creation, editing, deletion, selection, and connection, plus automatically refreshed per-profile Online/Offline reachability badges.
- Optional remembered passwords and a connection-time prompt otherwise.
- Add-connection QR scanning via camera or uploaded image/screenshot, filling OBS address/password for review without saving or connecting automatically. Parser and scanner lifecycle/form regressions pass; real camera/image browser acceptance remains outstanding.
- Studio Mode gate with an enable button.
- Separate 16:9 Preview and Program monitors with OBS screenshot playback or centered scene-name fallback, independent source menus, top-left indicators, and scene-tile indicators.
- Square scene buttons below both monitors occupy one horizontally scrollable row without a visible section header, with centered names, bottom Preview/Program labels, and saturated green/red selection-colored borders; scene selection changes Preview only. The shared app shell uses dynamic viewport height to account for visible browser toolbars. These layout/color tweaks still require visual browser acceptance.
- A standalone Transition button is vertically centered between the monitors. A separate settings button below the action opens transition choices followed by a separator and duration input; these update the OBS transition type and non-fixed duration (50–20,000 ms) without triggering a transition.
- Event-driven synchronization with OBS, manual refresh in the appbar, busy controls, visible request errors, and disconnect handling.
- Active-media controls below the scenes list for OBS Media Sources and VLC sources on Preview or Program, including enabled nested scenes/groups, with independent Preview/Program labels, elapsed/total time, shadcn/ui Slider with millisecond scrubbing and custom one-second arrow-key seeking and a live time tooltip above the thumb during dragging, Play/Pause, Stop, and sequential position updates. Play resumes paused media or restarts stopped/finished media. Above 900px, Preview media occupies the left half and Program media the right half; the sections stack on narrower screens. Shared sources appear in both sections with a note that playback controls and seeking also change Program playback. Unknown-duration or unavailable media cannot be scrubbed; playback buttons work without a known duration when media state permits. Protocol and DOM regressions pass; live playback and browser acceptance remain outstanding.
- Automated protocol, connection-management UI, and persistence tests; production build verification.

Media seeking keeps the selected position and elapsed time optimistic after release until a fresh OBS read started after seek acknowledgment arrives. Shared Preview/Program controls use the same optimistic position, old reads cannot cause a snap-back, and unsuccessful seeks restore OBS state. Automated regressions pass; live OBS/browser acceptance remains outstanding.

Targeted live media-seek diagnosis on 2026-11-12: OBS 33.0.1 / obs-websocket 5.7.6 on macOS 26.6.2 over a loopback WebSocket connection reproduced backward seeking while the source was paused, using direct protocol requests without the app or a browser. The source reported a duration of 18,668ms. Requests for 16,000, 17,000, and 18,000ms all returned 15,041ms immediately and after 500ms; requests for 1,000, 6,000, and 11,000ms returned 41, 5,041, and 10,041ms. `ffprobe` found video keyframes at 0, 5, 10, and 15 seconds and a container duration of 18.668844s, identifying OBS's backward keyframe seeking as the cause of the observed snap-back. [OBS 33.0.1 seek implementation](https://github.com/obsproject/obs-studio/blob/33.0.1/shared/media-playback/media-playback/media.c#L488) uses `av_seek_frame` with `AVSEEK_FLAG_BACKWARD`. The source was restored to its original paused cursor of 15,041ms; scene selections and source settings were not changed. This validates a source/protocol limitation, not browser rendering, accurate arbitrary-frame seeking, or the rest of live acceptance. Tests cover exact near-end request positions and reconciliation to OBS's actual cursor; no app behavior was changed to mask OBS's position.

Acceptance to close M1:

- Run the automated checks described in [development](development.md).
- Complete and record the live OBS checklist there, including Cut, Fade, a stinger if available, external changes, and connection recovery.
- Record remaining issues as limitations or follow-up scope instead of describing unverified behavior as validated.

Automated checks passed when the base was implemented. Full live OBS acceptance and visual browser QA remain outstanding.

Targeted live verification on 2026-11-11: read-only checks against OBS 33.0.1 / obs-websocket 5.7.6 on macOS Tahoe 26.6.2 verified the shared client's ordering for all 10 scenes. The original response order differed from the Scenes dock; sorting by descending `sceneIndex` matched it. Program and Preview selections were unchanged. Automated regressions also cover initial ordering and `SceneListChanged`; a live reorder and the rest of the acceptance checklist have not been exercised.

## M2 — Reliability validation and fixes

**Status: proposed follow-up; sequencing requires user direction.**

Validate the base against real OBS and supported desktop browsers, then fix observed issues. Pay particular attention to collection switches, rapid external changes, interrupted transitions, stale state after failed synchronization, and transitions longer than the current fallback timeout.

Acceptance: document the tested environment and results, add regression coverage for fixes, and resolve or explicitly track reproducible issues. Automatic reconnect and additional controls require a product decision rather than being assumed parts of this milestone.

## M3 — Preview and Program video

**Status: OBS screenshot playback and independent monitor settings implemented; remote streams and broader browser/output-fidelity validation remain outstanding.**

Delivered:

- Each monitor’s translucent overlay contains the top-left Preview/Program indicator, a full-height settings button flush with the right corner, and the centered scene name during live playback. It stays visible at all times, including while the dropdown is closed.
- No Preview shows the centered scene name. OBS Preview displays repeated `GetSourceScreenshot` frames; Remote Preview is disabled and does nothing.
- A text-only Show Previews / Hide Previews button above the Transition action on desktop toggles both monitors together. Mixed/off states enable both on click; when both are enabled, clicking disables both. Individual menus and the combined toggle stay synchronized.
- Preferences persist independently per saved profile and monitor; both default to No Preview. Explicitly saved OBS Preview selections remain enabled across reloads.
- Response/decode-paced JPEG capture at width 640, quality 65, capped at 10 FPS per enabled monitor, with bounded current-generation requests, hidden-tab pause, failure backoff, and stale-frame/session cleanup.
- Scene buttons now use persistent representative thumbnails. A sequential collector caches missing images when active scenes naturally reach 5 seconds (half-duration for short clips); black/near-black candidates are rejected. The selected Preview monitor uses a labeled cached image before useful media playback or when live screenshots are black/unavailable.
- The appbar **OBS actions** dropdown contains Refresh OBS state and Generate Previews. Generation visits scenes on Preview, loads/seeks eligible media, retries screenshots, and restores Preview and playback where possible. It skips media active on Program and stops mutations after external selection/session changes. Thumbnails are stored per endpoint/collection/scene in IndexedDB; explicit generation replaces stale images.
- Follow-up Camera Scene fix verified on 2026-11-12 against the same OBS endpoint using the production generation function in Bun: with Camera Scene on Preview and Blank / Image on Program, the unavailable Media Camera blocked generation before Media (the 18-second video) was attempted. Generation now skips failed media candidates and seeks only the first usable source, then captures the full scene. The live check produced a non-black Camera Scene image with zero skipped scenes and unchanged Program/Preview selections. Natural caching likewise uses the first playable known-duration source instead of requiring all media sources. Regression tests cover unavailable camera/status/cleanup failures, first-source selection, and natural capture without media mutations. Browser image/persistence acceptance remains outstanding.
- Targeted live media validation on 2026-11-12, using OBS 33.0.1 on macOS Tahoe 26.6.2 via `ws://127.0.0.1:4453` (authenticated Bun WebSocket harness; no browser): inactive Cântico 38 captured all-black; an inactive seek was rejected until playback started, and restart plus seek remained black while inactive. Selecting it on Preview then restarting/seeking produced a non-black image at an observed keyframe-aligned cursor near 4.4 seconds. A batch using the production generation function captured usable images for eight of ten scenes; Remote failed to load and Camera Scene was skipped because its media was active on Program. Program selection stayed unchanged and the original Preview was restored. Browser layout, image decoding/IndexedDB persistence, broad VLC/source-setting behavior, and complete OBS/browser acceptance remain outstanding. Automated regressions cover the generation guards, restoration, black-frame retries, natural caching, hydration, and monitor fallback; tests and production build pass.
- Read-only live capture verification on 2026-11-12: both monitors received 22 valid JPEG frames in about 2.2 seconds from the supplied local OBS instance, with no capture errors and unchanged Preview/Program selections. This checks capture throughput, not browser rendering smoothness or actual output fidelity.
- Automated tests cover request sharing/caps, collection invalidation, loop pacing, decode-before-draw, cancellation, preferences, and the disabled remote option.

Remaining acceptance:

- Verify visual smoothness, memory/OBS load, and control responsiveness in the actual browser over the intended network. Browser drawing is covered by controlled tests; live browser QA has not been performed.
- Validate rapid scene/collection changes, non-16:9 sources, long capture stalls, and suspend/resume against real OBS.
- Named-scene screenshots can differ from Program output during transitions or same-scene Studio edits; use an actual Program-output transport when output-fidelity monitoring is required. See [research](preview-research.md).
- Implement Remote Preview only after choosing transport/configuration. MediaMTX/WebRTC is a browser candidate; NDI belongs to a future native implementation.

## M4 — Installable PWA and deployment

**Status: PWA and Cloudflare Workers deployment setup implemented; browser installation/update acceptance and production deployment remain outstanding. Local Vite HTTPS with mkcert is implemented.**

Delivered on 2026-11-12: standalone web manifest, regular/maskable/Apple icons derived from the custom StudioCTRL favicon, production-only app-shell precaching with route fallback, and an explicit update prompt. Applying updates is blocked while this window has an OBS session or connection attempt. Other open windows must be disconnected before accepting an update. Cached startup remains disconnected; live OBS state is never restored. Representative thumbnails have a separate browser-local cache (see M3). Automated update-prompt checks and production service-worker generation passed; installation and two-release updates have not been exercised in a browser.

Cloudflare Workers Static Assets setup added on 2026-11-12: root Wrangler config serving `dist/` with SPA fallback, pinned Wrangler tooling through `bun.lock`, build/deploy/dry-run/local-preview scripts, PWA cache headers, and local/Workers Builds instructions. Production build, Wrangler deployment dry run, and local HTTP checks passed for root/studio fallback, service-worker and manifest content types, and cache headers. No upload or account/domain configuration has been performed.

Resolve secure-context, WS/WSS, and browser network-access behavior for the intended OBS address. Direct WebSocket connectivity remains the selected architecture; a proxy is a future decision if required by deployment constraints. See [development](development.md#pwa-acceptance-checklist) for remaining validation, including deployment rollouts with clients using an older release.

Acceptance: verify installation and updates in the supported browsers, document a working deployment/network configuration, and show an honest disconnected state when OBS cannot be reached. Cached assets must not imply that live OBS control works offline.

## Future exploration — Native streaming

**Status: exploratory; outside the browser app scope.**

NDI may be explored in a future native wrapper, potentially using Capacitor. No native framework or NDI integration has been selected. Revisit only when native work is explicitly requested, preserving the browser controller's existing behavior.

## Updating this roadmap

Update status, delivered scope, acceptance evidence, and unresolved decisions when relevant work lands. Future milestone numbering organizes discussion; it does not establish a committed delivery order or authorize implementation.
