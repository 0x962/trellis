# Flow client compatibility checkpoint

TRL-783 prepares source for TRL-677. TRL-677 retains acceptance with both engines after TRL-674.
The batch verification owners run the checks after merge. This checkpoint runs no tests, type checks, or builds.

`runProgress` reads legacy records and exported `FlowExecutionViewV1` values.
`flowRunText` uses the immutable snapshot name and occurrence titles for V1 results.
`waitForRun` polls native and unknown waits. A human wait stops the local wait without review credit.
`readV1` validates external document and execution values with the exported public schemas.
Unknown schema versions and engine formats fail validation.
The V1 readers have fixture callers until TRL-696 supplies the handlers.

The registered commands continue to use the legacy client.
JSON keeps the complete response, including stable IDs and unknown workspace commits.
Both run-list spellings read pages until a short page. The 500-row request size is the existing API page size.
The local wait defaults to 60 minutes. A finite positive value has no application ceiling.
A timeout stops local polls and retains the last response. It sends no cancel request.
The server owns reused starts and execution-error retries. The CLI sends one start request per invocation.

## Missing integration for TRL-696

Source inspection: `packages/api/src/contract/flowDocumentsV1.ts` exports three procedures.
`packages/api/src/contract/index.ts` exports that object but excludes it from `contract`.
`apps/server/src/procedures/index.ts` and `apps/server/src/services/registry.ts` have no V1 registration.

| Declared procedure | HTTP route | Required result |
| --- | --- | --- |
| `flowDocumentsV1.get` | `GET /api/flows/{flow}/document-v1` | Saved document and publication state |
| `flowDocumentsV1.save` | `PUT /api/flows/{flow}/document-v1` | Save receipt with expected version and request replay |
| `flowDocumentsV1.view` | `GET /api/flow-executions/{id}/view-v1` | Immutable snapshot, occurrences, attempts, decisions, and stops |

TRL-696 must register these procedures, implement their services, and retain the strict legacy contracts.
Legacy graph reads and writes need the declared `FLOW_UNSUPPORTED_FORMAT` response for incompatible documents.
Its diagnostics and supported endpoint must survive the CLI error path.
`packages/cli/src/errors.ts` currently treats this unregistered error as exit 1 and prints only its message.
TRL-677 must integrate its diagnostics after the server registers the error.

The existing `flows.list` returns `FlowSummary[]` without an engine or publication state.
The existing `flowExecutions.start`, `list`, and `get` return legacy records.
There is no declared V1 list or start response. TRL-696 must resolve discovery and start composition before CLI activation.
This checkpoint does not invent those contracts or convert Langflow graphs into legacy graphs.
`flow run list` supports flow, ticket, and diff filters. Project filters belong to `flow list`.
The current run-list input has no project field.

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
| Shared RPC client | `packages/api/src/client.ts` | `TrellisClient` derives from the registered contract |
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

- `bun test packages/cli/src/commands/flow packages/cli/src/commands/flows packages/cli/src/commands/ready/flowReadiness.test.ts`
- `bun run --cwd packages/cli typecheck`
- Changed-file Biome checks and the agent guide checks

TRL-677 retains actual two-engine checks for aliases, filters, JSON, stable IDs, reused starts, execution errors, human waits, engine outages, and pagination.
The command fixtures supply fake HTTP responses. They do not prove server retry policy or Langflow operation.
