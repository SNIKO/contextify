# Repository Guidelines

## TypeScript/contextify
- Contextify is an AI-powered feed watcher that ingests YouTube, Telegram, Discord, and similar channels, distilling noisy feeds into structured, agent-ready insights.
- Incoming payloads land in the SQLite `raw_content` table; downstream processors turn each entry into topics, metrics, and keywords tuned for LLM reasoning.
- `src/services/base-processor.ts` defines the extraction contract and wraps LLM calls so new processors stay composable and deterministic.
- The MCP server inside `src/mcp/` exposes search, retrieval, and navigation tools that other agents consume to reason over the curated corpus.
- Favor pragmatic, KISS solutions that keep the ingestion→processing→exposure pipeline observable, debuggable, and easy to extend.

## Project Structure & Module Organization
- `src/index.ts` wires configuration loading, SQLite bootstrapping, ingestion scheduling, topic generation, and MCP startup.
- Source adapters live under `src/sources/`, persistent models in `src/storage/`, and shared types + loaders in `src/config/` with defaults in `config/crypto.yaml` and `.env` overrides.
- Services (`src/services/`) coordinate processors, queues, and lifecycle hooks; utilities such as the structured logger sit in `src/utils/`.
- Keep new modules near their runtime collaborators to avoid unnecessary abstraction layers.

## Build, Test, and Development Commands
- `pnpm dev` runs the live pipeline through `tsx src/index.ts` for iterative development.
- `pnpm build` compiles to `dist/`; `pnpm start` executes the built bundle; `pnpm clean` clears stale artifacts.
- Quality gates rely on `pnpm lint`, `pnpm lint:fix`, `pnpm format`, `pnpm format:check`, and `pnpm typecheck` for fast feedback.
- `pnpm test` is reserved for a future end-to-end smoke harness; avoid unit-test scaffolding unless requirements change.

## Coding Style & Tooling
- Target Node.js 20+ and TypeScript 5.9+ with native ES modules, top-level `await`, and incremental builds via `tsconfig.json`.
- Use 2-space indentation, kebab-case filenames (`topic-generation.ts`), named exports, and early returns to keep code paths readable.
- Leverage ESLint (typescript-eslint) and Prettier with repo configs; fix warnings before opening a PR.
- Compose features with plain objects and dependency injection instead of elaborate class hierarchies; favor async/await over promise chaining.

## Verification Practices
- We intentionally skip unit tests; validate changes by running `pnpm dev`, seeding representative feeds, and inspecting processed topics via SQLite or MCP tools.
- Document manual scenarios or scripts in `docs/` or `scripts/` so teammates can replay them quickly.
- Capture datapoint snapshots (sample topics, logs, MCP responses) in PRs to demonstrate behavioral intent.