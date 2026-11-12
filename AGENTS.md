# Agent guidance

studioctrl is a desktop-first, browser-based remote controller focused on OBS Studio Mode. Keep scene selection on Preview; send it to Program through an explicit transition action.

## Read before changing the app

- Read [milestones](docs/milestones.md) before planning features or changing scope. It distinguishes implemented behavior, outstanding validation, and deferred ideas.
- Read [architecture](docs/architecture.md) before changing OBS communication, state, persistence, routing, styling, or UI boundaries.
- Read [development](docs/development.md) before implementing or validating changes. It covers tooling, test selection, and live OBS checks.
- Use [README](README.md) for local setup. Use Bun for dependencies and scripts; retain `bun.lock` as the dependency lockfile.

## Styling

Use Tailwind utilities for layout, typography, responsive states, and component styling. Keep CSS for theme tokens/base integration and exceptional styles that utilities cannot reasonably express, such as complex custom animations. See the styling contract in [architecture](docs/architecture.md).

## Keep documentation current

Update the relevant documentation in the same task whenever implementation details, behavior, architecture, dependencies/tooling, setup, validation requirements, limitations, decisions, or milestone status change. Documentation updates are part of completing the work.

Keep each topic in its owning file: scope/status in `docs/milestones.md`, implementation contracts in `docs/architecture.md`, contributor workflow in `docs/development.md`, and user setup in `README.md`. Update this entry point when guidance or document locations change. Link to the owning document instead of duplicating its contents.

Before handing back, compare the changes with these documents, correct outdated claims, verify local links, and report any outstanding validation. Mark milestones complete only when their stated acceptance criteria are met. Treat future milestones as planning context; implement the scope authorized by the user.
