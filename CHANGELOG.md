# Changelog

Releases are cut with changesets. `bun run release` writes the versions and this file.

## 0.1.0

The first release. It comes from the changeset `.changeset/first-release.md`.

- Server: a local Hono server on port 4521 with PGlite, oRPC procedures, an OpenAPI spec, live updates over server-sent events, and rotating logs.
- Web: Needs you, the ticket table, the kanban board, the side peek, the ticket page, Cmd-K, filters, search, status settings, and dark and light themes.
- CLI: the `trellis` command for every procedure, with JSON output, actor resolution, and fixed exit codes.
- Agents: `trellis instructions`, the `x-trellis-actor` header, and the rule that an agent never moves a ticket to Done.
- Pull requests: auto-link by identifier, batched gh polling, the check ribbon, and the Failing CI section.
- Attachments, `trellis backup`, `trellis restore`, `trellis export`, and `trellis install` with a launchd agent.
- Mobile: the Expo app with Needs you, search, projects, the ticket screen, and swipe to approve.
- Repository: workspaces, turbo, Biome, TypeScript, CI with the e2e and drizzle-diff jobs, and the repo rules in AGENTS.md.
