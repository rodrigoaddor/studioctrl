# Milestones

This file owns product scope, decisions, milestone status, and deferred work. See [architecture](architecture.md) for implementation contracts and [development](development.md) for validation procedures.

## Product direction and settled decisions

- Build for larger screens first. Phone-first layouts are outside the initial target. Keep the interface compact with concise functional copy and no promotional sections or footer.
- Use a client-rendered React application with Vite, TypeScript, Tailwind CSS, editable shadcn/ui components, and simple React Router routes. SSR is unnecessary for the current scope.
- Keep control-state changes stable in layout: no press movement or layout-changing loading/error rows. The monitor hover overlay may fade through opacity only.
- Use Tailwind utilities for application styling; reserve CSS for theme/base integration and styles that utilities cannot reasonably express.
- Use Bun for dependencies and script execution.
- Connect directly to the OBS built-in WebSocket server. The operator supplies a reachable address, potentially through a network such as Tailscale.
- Operate only in Studio Mode. If disabled, offer an explicit enable button; connecting alone must not enable it.
- Keep one active OBS session at a time. **Exit** disconnects and returns to the connection manager; managing multiple simultaneous sessions is outside scope.
- Save connection profiles locally. Remembering a password is an explicit option, off by default.
- The controller includes scene selection and configurable OBS screenshot previews. Remote streams, PWA installation, and production hosting/TLS work are deferred. Local development HTTPS uses an ignored mkcert certificate.

## M1 — Base controller

**Status: implemented; live OBS acceptance remains outstanding.**

Delivered scope:

- Connection page with profile creation, editing, deletion, selection, and connection, plus automatically refreshed per-profile Online/Offline reachability badges.
- Optional remembered passwords and a connection-time prompt otherwise.
- Studio Mode gate with an enable button.
- Separate 16:9 Preview and Program monitors with OBS screenshot playback or centered scene-name fallback, independent source menus, top-left indicators, and scene-tile indicators.
- Square scene buttons below both monitors have centered names, bottom Preview/Program labels, and selection-colored borders; scene selection changes Preview only.
- A standalone Transition button is vertically centered between the monitors. A separate bottom-aligned selector changes the OBS transition type without triggering it, and a duration field updates non-fixed transitions in OBS (50–20,000 ms).
- Event-driven synchronization with OBS, manual refresh in the appbar, busy controls, visible request errors, and disconnect handling.
- Automated protocol, connection-management UI, and persistence tests; production build verification.

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

- Each monitor’s translucent overlay contains the top-left Preview/Program indicator, a full-height settings button flush with the right corner, and the centered scene name during live playback. It fades in on hover/focus, fades out without a delay, and stays visible with the dropdown.
- No Preview shows the centered scene name. OBS Preview displays repeated `GetSourceScreenshot` frames; Remote Preview is disabled and does nothing.
- A text-only Show Previews / Hide Previews button at the top of the monitor area toggles both monitors together. Mixed/off states enable both on click; when both are enabled, clicking disables both. Individual menus and the combined toggle stay synchronized.
- Preferences persist independently per saved profile and monitor; both default to No Preview. Explicitly saved OBS Preview selections remain enabled across reloads.
- Response/decode-paced JPEG capture at width 640, quality 65, capped at 10 FPS per enabled monitor, with bounded current-generation requests, hidden-tab pause, failure backoff, and stale-frame/session cleanup.
- Read-only live capture verification on 2026-11-12: both monitors received 22 valid JPEG frames in about 2.2 seconds from the supplied local OBS instance, with no capture errors and unchanged Preview/Program selections. This checks capture throughput, not browser rendering smoothness or actual output fidelity.
- Automated tests cover request sharing/caps, collection invalidation, loop pacing, decode-before-draw, cancellation, preferences, and the disabled remote option.

Remaining acceptance:

- Verify visual smoothness, memory/OBS load, and control responsiveness in the actual browser over the intended network. Browser drawing is covered by controlled tests; live browser QA has not been performed.
- Validate rapid scene/collection changes, non-16:9 sources, long capture stalls, and suspend/resume against real OBS.
- Named-scene screenshots can differ from Program output during transitions or same-scene Studio edits; use an actual Program-output transport when output-fidelity monitoring is required. See [research](preview-research.md).
- Implement Remote Preview only after choosing transport/configuration. MediaMTX/WebRTC is a browser candidate; NDI belongs to a future native implementation.

## M4 — Installable PWA and deployment

**Status: PWA installation and production deployment deferred; local Vite HTTPS with mkcert implemented.**

Add installation and a deliberate application update/cache strategy after the base controller is established. Choose hosting and resolve secure-context, WS/WSS, and browser network-access behavior for the intended OBS address. Direct WebSocket connectivity remains the selected architecture; a proxy is a future decision if required by deployment constraints.

Acceptance: verify installation and updates in the supported browsers, document a working deployment/network configuration, and show an honest disconnected state when OBS cannot be reached. Cached assets must not imply that live OBS control works offline.

## Future exploration — Native streaming

**Status: exploratory; outside the browser app scope.**

NDI may be explored in a future native wrapper, potentially using Capacitor. No native framework or NDI integration has been selected. Revisit only when native work is explicitly requested, preserving the browser controller's existing behavior.

## Updating this roadmap

Update status, delivered scope, acceptance evidence, and unresolved decisions when relevant work lands. Future milestone numbering organizes discussion; it does not establish a committed delivery order or authorize implementation.
