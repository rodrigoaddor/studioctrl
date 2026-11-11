# Development and verification

Use [README](../README.md) for initial setup, [architecture](architecture.md) for implementation boundaries, and [milestones](milestones.md) for authorized product direction and outstanding acceptance work.

## Tooling

Use the Bun version declared in `package.json` and commit dependency changes with `bun.lock`. Vite and Vitest currently use their standard Node-based CLIs through Bun scripts, so retain the Node requirement documented in README.

Use `bun install --frozen-lockfile` to verify an unchanged lockfile. Use `bun add` or `bun add -d` when dependencies change. Script definitions in `package.json` and configuration in `vite.config.ts` are the sources of truth for available commands and test discovery.

Run tests through `bun run test` so they use Vitest and the configured DOM environments. The command `bun test` invokes Bun's separate test runner.

## Choosing verification

For implementation changes, run `bun run test` and `bun run build`. Add focused regression coverage for new behavior or fixed bugs where useful. Report failures or checks that could not run.

- `tests/obs.test.ts` uses a real local WebSocket server simulating OBS v5, including authentication. Extend it for request ordering, events, session state, and failure behavior.
- `tests/connections.test.tsx` uses Testing Library with jsdom for profile management and password forms. Its dialog methods are shimmed; it does not prove native dialog focus or browser layout behavior.
- `tests/navigation.test.tsx` covers the single-session navigation contract, Exit, and connection-route redirects.
- `tests/profiles.test.ts` covers password persistence, malformed storage, and URL validation.

The protocol simulator is a controlled test double, not OBS. Passing tests do not establish real transition timing, scene-collection behavior, or browser network compatibility. Record browser/OBS observations separately. For documentation-only changes, verify claims against code and check Markdown links; application tests need rerunning only when executable inputs change.

## Live OBS acceptance checklist

Use an OBS instance and reachable WebSocket address supplied for testing. Record OBS version, browser/version, operating system, network/address scheme, and the date in the milestone acceptance notes when this is performed.

1. Save and edit a connection. Reload to confirm persistence. Verify passwords are omitted unless Remember password is enabled, and removed after opting out.
2. Connect with valid credentials, then verify clear feedback for invalid credentials and an unavailable endpoint. Confirm cancellation leaves no usable stale controls. While connected, confirm the brand link and Browser Back keep the active studio visible; **Exit** must disconnect and return to saved connections.
3. Start with Studio Mode disabled. Confirm the gate appears and connecting leaves OBS unchanged; enable it using the explicit button.
4. Select scenes and confirm only Preview changes. Check Program/Preview labels, including the case where both select the same scene.
5. Trigger Cut and Fade using their individual buttons. Confirm the selected OBS transition and resulting Program scene, using OBS's actual preview swap behavior. Test a stinger if available and confirm controls remain locked through playback.
6. Change scenes, names, Studio Mode, transition settings, and scene collection in OBS. Confirm the app catches up. Add a transition and verify Sync reloads the list.
7. Exercise rapid changes and interrupted transitions. Record any stale selection or stuck busy state, including behavior around the 30-second fallback.
8. Stop OBS or interrupt the network, then reconnect through a saved profile. Verify old scene state clears and the new session is accurate.
9. Inspect the desktop layout, keyboard navigation, dialogs/focus, long scene names, empty lists, and visible error feedback in the actual browser.

## Documentation completion

Follow the maintenance rule in [AGENTS.md](../AGENTS.md) for every relevant change. Update the owning document alongside implementation and keep implemented facts distinct from future proposals. Record test coverage and validation gaps rather than a test count that becomes stale. Update milestone acceptance only with evidence from the checks actually performed.
