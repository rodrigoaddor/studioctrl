# studioctrl

A desktop-first remote controller for OBS Studio Mode. React, TypeScript, Vite, React Router, Tailwind CSS, and shadcn/ui UI components. Connects directly using the OBS WebSocket v5 protocol through `obs-websocket-js`.

## Run locally

Use Bun 1.4.4 for dependency management and scripts. Node.js 22.12+ is required by the Vite and Vitest tooling.

```sh
bun install
bun run dev
```

Open the URL Vite prints. In OBS, open **Tools → WebSocket Server Settings**, enable the server, and note its address and password (the default port is 4455). Add a connection in studioctrl with a `ws://` or `wss://` URL, then connect. An empty password works when authentication is disabled in OBS.

## Documentation

- [Agent guidance](AGENTS.md): starting point and documentation maintenance requirements for future agents.
- [Milestones](docs/milestones.md): current implementation, outstanding acceptance, and deferred work.
- [Architecture](docs/architecture.md): OBS state, commands, synchronization, persistence, and implementation boundaries.
- [Development](docs/development.md): tooling, automated checks, and live OBS acceptance checklist.

## Validation

```sh
bun run test
bun run build
```

Tests use a simulated OBS WebSocket server and jsdom. See [development](docs/development.md) for coverage and verification limits; live OBS validation remains outstanding.
