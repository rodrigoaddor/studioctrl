# Milestones

This file owns product scope, decisions, milestone status, and deferred work. See [architecture](architecture.md) for implementation contracts and [development](development.md) for validation procedures.

## Product direction and settled decisions

- Build for larger screens first. Phone-first layouts are outside the initial target. Keep the interface compact with concise functional copy and no promotional sections or footer.
- Use a client-rendered React application with Vite, TypeScript, Tailwind CSS, editable shadcn/ui components, and simple React Router routes. SSR is unnecessary for the current scope.
- Use Tailwind utilities for application styling; reserve CSS for theme/base integration and styles that utilities cannot reasonably express.
- Use Bun for dependencies and script execution.
- Connect directly to the OBS built-in WebSocket server. The operator supplies a reachable address, potentially through a network such as Tailscale.
- Operate only in Studio Mode. If disabled, offer an explicit enable button; connecting alone must not enable it.
- Keep one active OBS session at a time. **Exit** disconnects and returns to the connection manager; managing multiple simultaneous sessions is outside scope.
- Save connection profiles locally. Remembering a password is an explicit option, off by default.
- The initial controller shows scene names and selections. Video previews, PWA installation, and hosting/TLS work are deferred.

## M1 — Base controller

**Status: implemented; live OBS acceptance remains outstanding.**

Delivered scope:

- Connection page with profile creation, editing, deletion, selection, and connection, plus automatically refreshed per-profile Online/Offline reachability badges.
- Optional remembered passwords and a connection-time prompt otherwise.
- Studio Mode gate with an enable button.
- Separate 16:9 Preview and Program monitor placeholders with centered scene names and top-right indicators on translucent overlay bars, plus scene-tile indicators, including when both select the same scene.
- Square scene buttons below both monitors have centered names, bottom Preview/Program labels, and selection-colored borders; scene selection changes Preview only.
- A split shadcn/ui ButtonGroup between the monitors triggers the currently selected OBS transition. Its dropdown selects other OBS transitions without triggering them; duration and other settings come from OBS.
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

**Status: 16:9 monitor layout and scene-name fallback implemented; video transport, preview toggles, and sequencing deferred.**

Candidate browser transports from the initial brief:

- Repeated OBS source screenshots for a low-frame-rate Preview and Program display, using the current scene and `GetSourceScreenshot`.
- External stream embedding, initially considering MediaMTX and WebRTC.

Before implementation, decide whether to support one transport or selectable providers, how to configure separate Preview/Program feeds, refresh rate and resource budgets, authentication, and failure behavior. A stream must be correctly identified as Preview or Program; an external feed is not automatically both.

Acceptance: both panels have clearly identified sources, useful loading/error states, and bounded resource use. Scene selection and transitions remain usable when video is unavailable. Evaluate latency and load with the chosen real transport.

## M4 — Installable PWA and deployment

**Status: deferred at the user's request.**

Add installation and a deliberate application update/cache strategy after the base controller is established. Choose hosting and resolve secure-context, WS/WSS, and browser network-access behavior for the intended OBS address. Direct WebSocket connectivity remains the selected architecture; a proxy is a future decision if required by deployment constraints.

Acceptance: verify installation and updates in the supported browsers, document a working deployment/network configuration, and show an honest disconnected state when OBS cannot be reached. Cached assets must not imply that live OBS control works offline.

## Future exploration — Native streaming

**Status: exploratory; outside the browser app scope.**

NDI may be explored in a future native wrapper, potentially using Capacitor. No native framework or NDI integration has been selected. Revisit only when native work is explicitly requested, preserving the browser controller's existing behavior.

## Updating this roadmap

Update status, delivered scope, acceptance evidence, and unresolved decisions when relevant work lands. Future milestone numbering organizes discussion; it does not establish a committed delivery order or authorize implementation.
