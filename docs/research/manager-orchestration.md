# Manager orchestration review

## Delegation follow-up, 2026-09-16

Status: planned. The user requested this correction after a review of the TRL manager logs from 09:46 to 13:09 Toronto time.
The manager repeatedly coordinated disk cleanup and reconciled installed and active release versions.
Those tasks consumed manager turns and context that could serve ticket assignments and review decisions.

- Create a ticket for disk cleanup and assign a worker. Let that worker own diagnosis, cleanup, checks, and the result.
- Delegate release version reconciliation to the SRE or another suitable worker. Require a concise result with evidence and any decision needed.
- Keep PR reviewer assignments, priorities, ownership, and dependencies with the manager.
- Give each delegated task an outcome, scope, acceptance conditions, and escalation conditions. Let its worker choose and coordinate the technical steps.
- Reuse the existing owner when a task already has one. Read results or changed blockers instead of repeatedly supervising technical steps.

Verify this change with the disk cleanup and release reconciliation scenarios.
The manager should create or reuse an assignment, record a wait, and continue other work until a result or blocker needs its decision.
Measure repeated status reads and manager turns per delegated task.

## Prior review

Reviewed on 2026-09-15 against Claude Code 2.1.273 and the live Trellis Manager persona.
The installed binary contains the workflow reference at byte 189212964.
The inspection covers that reference and Anthropic's current documentation, not a third-party skill with the same name.
Read the persona with `trellis personas list --json`; its ID is `01M277VFQA2HAWB58T9NTW4MX5`.
The implementation follows the approved changes below. Shared instructions contain no personal acceptance policy.

## Findings from other systems

**Ultra Code:** Anthropic documents it as a setting that combines high reasoning effort with automatic dynamic workflows.
The workflow script coordinates agents without direct filesystem or shell access.
Agents execute the technical work, while intermediate results stay outside the main conversation.
Structured results, bounded parallelism, and reusable workflows reduce the coordination burden.
Its embedded reference prefers a pipeline: each item advances as soon as its prerequisite completes.
Trellis should start a ticket's review when its builder finishes, without waiting for unrelated builders.
These mechanisms fit Trellis better than a larger manager prompt.
The default need not force an expensive workflow for each routine ticket event.
[Source: Anthropic dynamic workflows](https://code.claude.com/docs/en/workflows).

The restriction applies to the workflow script. The outer agent can still inspect code before it delegates.
Trellis needs a stricter manager boundary to meet the user's request.
Do not copy Ultra Code's instruction to disregard token cost or pursue exhaustive verification for every substantive task.

**Firstmate:** its supervisor contract delegates investigation, design, and code changes.
Its exceptions permit some direct project operations, which conflict with the requested Trellis role.
Use the delegation boundary without those exceptions.
[Source: supervisor contract](https://github.com/kunchenguid/firstmate/blob/main/AGENTS.md).

Firstmate also provides persistent quiet mode and a check that preserves supervision when a turn ends.
Trellis can use its existing controller for continuity.
It does not need another watcher or a nautical personality.
[Sources: quiet mode](https://github.com/kunchenguid/firstmate/blob/main/.agents/skills/quiet/SKILL.md),
[turn-end guard](https://github.com/kunchenguid/firstmate/blob/main/docs/turnend-guard.md).

**Herdr:** process activity and task success have different meanings.
Its idle and done states indicate readiness for input; neither proves that a ticket meets its acceptance conditions.
It also exposes the source of an agent state for diagnosis.
Keep this distinction in Trellis and send technical diagnosis to a worker.
[Sources: agent automation](https://herdr.dev/docs/agent-automation/),
[state authority](https://herdr.dev/docs/agents/).

## Gaps in Trellis

| Finding and evidence | Recommended change |
| --- | --- |
| The persona prohibits technical work, but `prepareClaude.ts:17` launches with permission bypass and no manager-specific tool restriction. | Give managers Trellis record and agent controls. Put repository, shell, merge, and deploy tools behind worker assignments. Enforce this across harnesses. |
| `controller/dispatch.ts` records delivery as sent or unknown. Its `finished` function does not record a coordination result. | Distinguish delivery from handled work. Record the resulting assignment, decision, or reason for no action. Preserve unfinished coordination across interruption. |
| The saved persona includes a personal UI acceptance policy. | Keep shared instructions generic. Apply each project's acceptance and communication policy. |
| The persona requests all open tickets at startup and a persona read on each heartbeat. `collectHeartbeats.ts` uses a one-minute interval. | Supply a compact change summary and policy version. Fetch further records only when they affect a decision. |
| Quiet operation depends on prose. Three short sentences can still repeat existing records. | Deduplicate decision requests and comments by ticket, subject, and revision. Routine successful actions produce no comment. |
| The role requests parallel starts but does not explicitly prohibit a wait for all builders before review. | Advance each ticket independently. Wait for multiple results only when the next task depends on all of them. |
| Several sections repeat release delegation, authorization reuse, continued work, and silent completion. | Keep one short role contract. Store project authorization and UI acceptance policy separately as structured records. |

The event envelope already contains only data in `controller/message.ts`. Keep that design.
The persona already separates merged, deployed, and complete outcomes. Keep that distinction too.

## Core role

> You coordinate project work through Trellis. Own priorities, scope, assignments, dependencies, decisions, and accurate status.
>
> Delegate all technical work, including discovery, plans, code, tests, review, merges, deployment, and recovery.
> Give the worker the outcome, acceptance conditions, scope, references, and existing authority.
> Let the worker choose the technical method. Delegate technical decomposition when needed.
>
> Start independent work within capacity. Reuse an active owner when it holds useful context.
> If capacity is full, queue the assignment. Do not perform the work yourself.
>
> Treat events as notices to reconcile current records. Process each event once.
> Route results and decisions to the responsible worker. Trust specialist reports within their stated scope.
> Ask that specialist to resolve missing or conflicting evidence.
>
> Put required human decisions on the affected ticket once. Block only the work that depends on the answer.
> Continue other eligible work. Apply existing authorization without repeated approval requests.
>
> Default to silence. Record only a new decision, actionable blocker, or material result that existing records do not show.
> Before you finish, leave each actionable item assigned, queued, or blocked on a recorded prerequisite.
> Let the controller wait for new events when no action remains.

## Acceptance checks for the changes

- An approved release with conflicts reaches a worker without manager Git commands or another approval question.
- A human decision on one ticket does not stop independent assignments.
- A repeated event produces no duplicate worker or comment.
- An interruption preserves unfinished coordination and its stable assignment ID.
- Worker exit alone does not close a ticket.
- Shared manager instructions contain no personal name or mandatory UI testing policy.
- An unchanged heartbeat produces no public message.

The manager role lives in the selected persona's `instruction` field in the database.
The persona editor shows the full text that each supported harness receives as its system prompt.
Manager tools enforce the role boundary. Dispatch outcomes preserve unfinished coordination.
Comment keys suppress repeated writes for the same actor, ticket, subject, and revision.

## Harness boundary and limits

Managers receive a dedicated Trellis tool catalog for records, assignments, flow controls, and dispatch outcomes.
Each tool validates the existing API input schema and uses the manager's actor and attempt token.
The session tool returns process status, receipts, and the worker's final report. It omits native tool details and terminal history.
Manager processes use a private directory that remains stable across attempts for the same assignment.
Workers retain their existing tools and repository directories.

Claude managers disable built-in tools and load only the Trellis MCP server.
Their permission mode denies unapproved tools instead of bypassing permissions.
A local API fixture captured Claude Code 2.1.273's model request and confirmed that its tool list contains only Trellis tools.
The fixture uses a temporary credential directory and sends no request to Anthropic.

OpenCode managers use a private plugin that denies other tools and supplies only the Trellis MCP server.
Pi managers disable built-in tools and automatic extensions. Their private extension registers the Trellis catalog and rejects other tool names.
Adapter and integration tests cover these restrictions. They do not prove behavior on every provider version.

Codex and custom managers fail before process launch with an error that names the supported alternatives: Claude, OpenCode, and Pi.
Codex remains available for workers. Its current configuration lacks a complete built-in tool allowlist.
Its hook documentation states that some tool paths bypass hooks, so a hook alone cannot enforce this boundary.
A custom launch command provides no verifiable tool contract.
[Source: Codex hook coverage](https://developers.openai.com/codex/hooks#tool-coverage).

These controls restrict tools available to the agent model. They are not an operating-system sandbox.
Existing manager processes retain their launch configuration until a new attempt starts.

## Manager system role and communication

A local request capture found a 9,135-character coding system prompt above the manager's assignment message.
That system prompt described an interactive software agent and terminal communication with the user.
The Trellis manager contract previously occupied the user message, below those instructions.
The capture excluded a canary `CLAUDE.md`, so it did not reproduce global instruction leakage in this harness.

Managers receive the selected database persona instruction as their exact native system prompt.
Assignment messages carry identity and project facts.
Claude uses `--system-prompt` and `--system-prompt-snapshot off` on start and resume.
The provider recommends replacement when the agent's identity or communication surface differs from its coding assistant.
[Source: system prompt replacement and resume behavior](https://code.claude.com/docs/en/cli-reference#system-prompt-flags).

Claude Code 2.1.273 accepted both flags in a local model fixture.
The request contained the manager contract in its system field and omitted the interactive coding and terminal communication instructions.
A second fixture resumed a session with a saved canary system prompt and verified that the current manager contract replaced it.
These fixtures verify prompt composition. They do not measure model compliance.

OpenCode uses a custom primary-agent prompt and replaces the final system text through its native plugin hook.
The final replacement excludes global instruction files that OpenCode otherwise appends after a custom agent prompt.
[Source: system assembly and plugin hook](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/session/llm/request.ts#L52).
Pi uses a custom system prompt and an explicit empty append value to exclude automatic `APPEND_SYSTEM.md` discovery.

Tool permissions do not restrict ordinary assistant text.
A Stop hook runs after the response and can force another turn, so it cannot prevent a terminal question.
[Source: Stop hook timing and decisions](https://code.claude.com/docs/en/hooks#stop).
The manager contract directs questions to tickets. The native terminal remains an observable transcript, not an enforced communication channel.
