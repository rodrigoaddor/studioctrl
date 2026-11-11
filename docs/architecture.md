# Architecture and implementation contracts

This file describes current implementation. Future capabilities and their status belong in [milestones](milestones.md).

## Application boundaries

The app is a browser-only SPA. It connects directly to one OBS WebSocket v5 session at a time, with RPC version 1 and the JSON build of `obs-websocket-js`. There is no application backend, account system, proxy, service worker, or video transport.

| Boundary | Responsibility |
| --- | --- |
| `src/lib/obs.ts` | `StudioClient`: WebSocket lifecycle, OBS requests/events, state snapshots, synchronization, command guards, and errors. |
| `src/context.tsx` | One client per provider; React subscribes through `useSyncExternalStore`. |
| `src/lib/profiles.ts` | Profile schema, URL normalization, and browser-local persistence. |
| `src/pages/connections.tsx` | Profile forms, password prompt, connection selection, and navigation after connection. |
| `src/pages/studio.tsx` | Studio Mode gate, current scenes, Preview selection, transition controls, and explicit Sync. |
| `src/App.tsx` | Shared shell, connection status, global errors, and route definitions. |
| `src/components/ui/` | Generated shadcn/ui primitives using the configured preset. `components.json` configures future additions. |
| `src/index.css` | Tailwind theme and application layout/styles, optimized for larger screens. |

Routes use React Router's `BrowserRouter`: `/` manages connections and `/studio` displays the controller. The studio route returns to connections without an active session. During an active connection, the connections route redirects to the studio and the brand link stays in the studio. The single **Exit** button disconnects and returns to connections; saved profiles remain available for the next session. Browser Back cannot open the connection manager while a session remains active. Static hosts need an `index.html` fallback for client routes.

## UI theme and density

Use shadcn/ui preset `b1Zirub0S`: Lyra style, mist base, blue theme/chart colors, Lucide icons, Inter font, default radius, and subtle menu accents. The component base is Radix (`radix-lyra` in `components.json`). Button and Input come from that preset; Inter is bundled through `@fontsource-variable/inter`.

Theme variables in `src/index.css` own the palette. Application surfaces use those variables; Preview and Program retain separate semantic status colors. The app currently defaults to dark mode through the root HTML class. `tsconfig.json` and `tsconfig.app.json` expose the `@/*` alias for the shadcn CLI and application respectively; Vite resolves it at runtime.

Keep the interface compact and functional: a 48px appbar, 24px desktop main padding, concise page headings, and no promotional copy or footer. The studio page shows the profile name without a server-address row. Use Lucide Cast for the app icon and `public/favicon.svg`; the favicon uses the same Lucide SVG geometry.

To reapply or change the preset, use the shadcn CLI, then inspect generated components and CSS so existing application rules do not override the theme. The preset was applied with `bunx shadcn@latest init --preset b1Zirub0S --base radix --force --no-reinstall --yes`, followed by `bunx shadcn@latest add button input --overwrite --yes`.

## OBS is the authority

Program is the current output scene; Preview is the prepared next scene in Studio Mode. A scene can occupy both. Keep their indicators independent.

`selectScene` calls `SetCurrentPreviewScene`. `transition` calls `SetCurrentSceneTransition` before `TriggerStudioModeTransition`; this also changes the transition selected in OBS. Duration and other transition behavior come from OBS, including any OBS-side configuration that affects the result.

Connecting does not enable Studio Mode. `enableStudio` explicitly calls `SetStudioModeEnabled`. Studio-dependent commands are guarded in the client as well as disabled in the UI. Busy and syncing states also block commands.

## Synchronization and lifecycle

Connection state is `disconnected`, `connecting`, or `connected`; connection success and initial synchronization are separate operations. The client subscribes to scene selections, scene list/name changes, Studio Mode, scene collection changes, and current transition settings. These events request full state refreshes rather than maintaining separate optimistic scene state in React.

Refreshes share an in-flight promise and coalesce additional requests into another pass. A revision counter and client identity prevent outdated responses from overwriting a newer snapshot. Commands wait for refresh completion before returning. Collection changes clear scene selections while the new collection loads.

Transition start events lock controls. `SceneTransitionVideoEnded` unlocks them and refreshes state; `SceneTransitionEnded` alone can represent the cut point of a stinger rather than the end of playback. An app-triggered transition has a 30-second fallback that unlocks and refreshes if completion was not observed. Preserve the distinction when changing transition logic.

Disconnect clears scene state and timers. Intentional disconnect removes the old client's listeners; callbacks and asynchronous commands check client identity. Authentication failures receive a password-specific error. Reload and dropped connections require the operator to connect again.

## Profiles and passwords

Profiles are stored under `studioctrl.connections.v1` in localStorage with `id`, `name`, `url`, `rememberPassword`, and an optional `password`. Valid URLs use `ws://` or `wss://`, with no embedded credentials or fragment. Loading tolerates malformed storage and filters invalid entries.

Only explicitly remembered passwords are persisted; opting out removes the password on save. Non-remembered passwords are requested when connecting. The live session snapshot omits the profile password. Remembered passwords are stored without encryption, as disclosed by the connection form.

Changes to the persisted schema need an explicit migration/compatibility decision. Keep credential handling within the profile and connection boundaries.

## Current limitations to consider when changing behavior

- Newly configured transitions can be loaded with Sync; there is no transition-list event subscription.
- Synchronization errors are displayed and release the syncing flag; the previous snapshot may remain visible. A connected status alone does not prove a fresh snapshot.
- The fallback timeout can unlock controls during unusually long transitions. Externally started transitions rely on the video-end event for unlocking; interrupted transitions require real OBS validation.
- Scene selections are tracked by names, not UUIDs. Renames trigger a refresh.
- Validation uses a simulated OBS protocol server and DOM tests; actual OBS/browser acceptance remains outstanding.

Consult the [OBS protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md) and [client documentation](https://github.com/obs-websocket-community-projects/obs-websocket-js) when changing protocol interactions. Installed types and the current implementation remain the immediate references for supported calls.
