# Flow client compatibility

TRL-677 owns command compatibility and acceptance with both engines.
The integration fixture lives in `integrations/langflow/tests/cli/`.
It connects CLI requests to the registered RPC router and services on a database with production migrations.

`runProgress` reads legacy records and exported `FlowExecutionViewV1` values.
`flowRunText` uses the immutable snapshot name and occurrence titles for V1 results.
`waitForRun` polls native and unknown waits. A human wait stops the local wait without review credit.
`readV1` validates external document and execution values with the exported public schemas.
Unknown schema versions and engine formats fail validation.
The CLI uses `flowDocumentsV1.list` for both engines and follows every result page.
Legacy identities use `flowExecutions.get`, which preserves their JSON response shape.
Langflow identities use `flowDocumentsV1.view` and validate its version and engine.
`flow run show` negotiates through the versioned view before it selects the matching reader.
`flow document show <flow>` explicitly requests the version 1 saved document.

The local wait defaults to 60 minutes and accepts a finite positive value without an application ceiling.
A timeout stops local polls and retains the last response. It sends no cancel request.
The server owns reused starts and execution-error retries. The CLI sends one start request per invocation.
TRL-694 owns the shared review policy and the readiness consumer.

## Integration with TRL-696

The registered `flowDocumentsV1.get`, `save`, `view`, and `list` procedures serve the V1 contracts.
`flow run list` supports flow, ticket, and diff filters. Project filters belong to `flow list`.
The run-list input has no project field.

The start command still uses the legacy mutation contract.
TRL-868 owns the versioned action contract under TRL-696.
Langflow start and actual engine acceptance remain required by TRL-677.
No read result authorizes a mutation through the legacy transport.

## Bounded client inventory

This inventory records discovered surfaces on 29 September 2026. It does not establish an approved support set.
The search covers this repository and five named local configuration files.
It excludes credentials, request headers, environment values, provider conversations, and private client arguments.

| Discovered surface | Evidence | Compatibility work |
| --- | --- | --- |
| Canonical CLI | `flow/flow.ts` | `flow list`, `flow start`, `flow run list`, `flow run show` |
| Saved aliases | `../flows/flows.ts`, `../../verbs.ts` | `flows list`, `flows run <diff> --flow <flow>`, `flows runs <diff>` |
| Agent readiness | `../ready/flowReadiness.ts` | Every result page, stable flow ID, successful review only |
| Agent instructions | `packages/api/src/agentGuide/template.md`, `apps/server/src/services/brief/flowLines.ts` | Flow selection, reuse, repeat rules, local timeout |
| Web discovery/editor | `apps/web/src/features/flows/` | Legacy list/get/create/update/save/delete calls |
| Web review actions | `apps/web/src/features/reviews/FlowRuns/` | List/start/decision/cancel and legacy run trees |
| Shared RPC client | `packages/api/src/client.ts` | `TrellisClient` types legacy calls and declared V1 calls |
| External HTTP callers | `apps/server/src/app.ts` | OpenAPI surface exists; caller identities remain unknown |
| Mobile source | `apps/mobile/src/` | No direct `flows.*` or `flowExecutions.*` caller found |
| Repository MCP config | `.mcp.json` | Absent |
| Home MCP config | `~/.mcp.json` | Absent |
| Local client config | `~/.claude.json` | Six top-level MCP entries, zero Trellis matches |
| Local client config | `~/.codex-work/config.toml`, `~/.codex/config.toml` | Eleven MCP entries in each, zero Trellis matches |

Repository discovery uses `rg -l 'flowExecutions\.|flows\.' apps/web/src apps/mobile/src packages/cli/src`.
The configuration check parses only top-level MCP entries and matches `trellis` in the name, command, URL, or arguments.
The retained result contains only file names and counts. Nested project configurations and other installed clients remain outside this bounded search.
A missing match does not prove that no external caller exists.
Navid must approve the support set. Native mobile scope remains a separate decision.

## Deferred checks

Run these checks through the existing batch owner:

- `bun test packages/cli/src/commands/flow packages/cli/src/commands/flows packages/cli/src/commands/ready`
- `bun run --cwd packages/cli typecheck`
- Changed-file Biome checks and the agent guide checks

TRL-677 retains actual two-engine checks for aliases, filters, JSON, stable IDs, reused starts, execution errors, human waits, engine outages, and pagination.
The package command fixtures supply fake HTTP responses.
The integration fixture reads real stored records without a Langflow engine.
Neither fixture proves actual Langflow operation.
