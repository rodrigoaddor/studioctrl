# Development and verification

Use [README](../README.md) for initial setup, [architecture](architecture.md) for implementation boundaries, and [milestones](milestones.md) for authorized product direction and outstanding acceptance work.

## Tooling

Use the Bun version declared in `package.json` and commit dependency changes with `bun.lock`. Vite and Vitest currently use their standard Node-based CLIs through Bun scripts, so retain the Node requirement documented in README.

Use `bun install --frozen-lockfile` to verify an unchanged lockfile. Use `bun add` or `bun add -d` when dependencies change. Script definitions in `package.json` and configuration in `vite.config.ts` are the sources of truth for available commands and test discovery.

Run tests through `bun run test` so they use Vitest and the configured DOM environments. The command `bun test` invokes Bun's separate test runner.

Local development and preview require the ignored mkcert pair described in [README](../README.md). Tests and production builds deliberately skip loading it, allowing CI and fresh checkouts to validate without private keys. When changing TLS configuration, verify an HTTPS response with the certificate’s hostname and confirm `.cert/` remains ignored.

## Choosing verification

For implementation changes, run `bun run test` and `bun run build`. Add focused regression coverage for new behavior or fixed bugs where useful. Report failures or checks that could not run.

- `tests/obs.test.ts` uses a real local WebSocket server simulating OBS v5, including authentication. It covers top-to-bottom scene ordering at connection time and after `SceneListChanged`, alongside request ordering, events, session state, and failure behavior.
- `tests/reachability.test.ts` covers OBS Hello validation, unauthenticated probing, network failures, timeout, and cancellation using a controlled WebSocket double.
- `tests/connection-status.test.tsx` covers badge rechecks, unmount cleanup, and discarded results after URL edits.
- `tests/connections.test.tsx` uses Testing Library with jsdom for profile management, password forms, and independent per-profile reachability badges. Its dialog methods are shimmed; it does not prove native dialog focus or browser layout behavior.
- `tests/studio.test.tsx` covers dropdown selection versus explicit transition triggering, scene selection, independent Preview/Program indicators, and busy-state guards.
- `tests/navigation.test.tsx` covers the single-session navigation contract, Exit, and connection-route redirects.
- `tests/profiles.test.ts` covers password persistence, malformed storage, and URL validation.

The protocol simulator is a controlled test double, not OBS. Passing tests do not establish real transition timing, scene-collection behavior, or browser network compatibility. Record browser/OBS observations separately. For documentation-only changes, verify claims against code and check Markdown links; application tests need rerunning only when executable inputs change.

## Live OBS acceptance checklist

Use an OBS instance and reachable WebSocket address supplied for testing. Record OBS version, browser/version, operating system, network/address scheme, and the date in the milestone acceptance notes when this is performed.

1. Verify reachable OBS endpoints (including password-protected ones) show Online, unavailable endpoints show Offline, and badges update after endpoint availability changes. Save and edit a connection. Reload to confirm persistence. Verify passwords are omitted unless Remember password is enabled, and removed after opting out.
2. Connect with valid credentials, then verify clear feedback for invalid credentials and an unavailable endpoint. Confirm cancellation leaves no usable stale controls. While connected, confirm the brand link and Browser Back keep the active studio visible; **Exit** must disconnect and return to saved connections.
3. Start with Studio Mode disabled. Confirm the gate appears and connecting leaves OBS unchanged; enable it using the explicit button.
4. Compare scene order against the OBS Scenes dock at connection time and after reordering in OBS. Select scenes from the square button grid and confirm only Preview changes. Verify centered names, bottom state labels, and distinct Preview/Program borders. Check Program/Preview labels, including the case where both select the same scene.
5. Select Cut and Fade through the split control dropdown, verifying that choosing an option changes the selected transition without taking Program. Trigger each using the main button. Confirm the selected OBS transition and resulting Program scene, using OBS's actual preview swap behavior. Test a stinger if available and confirm controls remain locked through playback.
6. Change scenes, names, Studio Mode, transition settings, and scene collection in OBS. Confirm the app catches up. Add a transition and verify the appbar refresh button reloads the list.
7. Exercise rapid changes and interrupted transitions. Record any stale selection or stuck busy state, including behavior around the 30-second fallback.
8. Stop OBS or interrupt the network, then reconnect through a saved profile. Verify old scene state clears and the new session is accurate.
9. Inspect the desktop layout, keyboard navigation, dialogs/focus, long scene names, empty lists, and visible error feedback in the actual browser.

## Documentation completion

Follow the maintenance rule in [AGENTS.md](../AGENTS.md) for every relevant change. Update the owning document alongside implementation and keep implemented facts distinct from future proposals. Record test coverage and validation gaps rather than a test count that becomes stale. Update milestone acceptance only with evidence from the checks actually performed.
