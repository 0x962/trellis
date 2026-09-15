# Manager orchestration review

Reviewed on 2026-09-15 against Claude Code 2.1.273 and the live Trellis Manager persona.
The installed binary contains the workflow reference at byte 189212964.
The inspection covers that reference and Anthropic's current documentation, not a third-party skill with the same name.
Read the persona with `trellis personas list --json`; its ID is `01M277VFQA2HAWB58T9NTW4MX5`.
This document proposes changes. It does not change the saved persona or controller.

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
| The UI section says to ask Navid to refresh and test. The final section prohibits terminal questions. | Name the channel explicitly: put the deployed result and test request on the ticket. |
| The persona requests all open tickets at startup and a persona read on each heartbeat. `collectHeartbeats.ts` uses a one-minute interval. | Supply a compact change summary and policy version. Fetch further records only when they affect a decision. |
| Quiet operation depends on prose. Three short sentences can still repeat existing records. | Deduplicate decision requests and comments by ticket, subject, and revision. Routine successful actions produce no comment. |
| The role requests parallel starts but does not explicitly prohibit a wait for all builders before review. | Advance each ticket independently. Wait for multiple results only when the next task depends on all of them. |
| Several sections repeat release delegation, authorization reuse, continued work, and silent completion. | Keep one short role contract. Store project authorization and UI acceptance policy separately as structured records. |

The event envelope already contains only data in `controller/message.ts`. Keep that design.
The persona already separates merged, deployed, and complete outcomes. Keep that distinction too.

## Proposed core role

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
- A UI deployment produces one ticket update for Navid to test.
- An unchanged heartbeat produces no public message.

Implement the tool boundary and handled-work record before adding more instructions to the prompt.
