# studioctrl

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

 In OBS, open **Tools → WebSocket Server Settings**, enable the server, and note its address and password (the default port is 4455). Add a connection in studioctrl with a `ws://` or `wss://` URL, then connect. An empty password works when authentication is disabled in OBS.

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

Monitor settings offer No Preview or OBS Preview independently for Preview and Program, defaulting to No Preview and remembering each browser-local choice; Remote Preview is reserved for later. OBS Preview uses low-frame-rate scene screenshots, with the scene name as fallback.

Tests use a simulated OBS WebSocket server and jsdom. See [development](docs/development.md) for coverage and verification limits; full browser/OBS acceptance remains outstanding.
