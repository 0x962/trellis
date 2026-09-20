# Build strategy: the accepted proposal, built by many agents

Navid, 2026-09-20: "build an ultracode strategy to implement. spread load across opus, fable, codex and meta muse. Use all 3 claude accounts to spread quota. Constantly monitor quota and ensure you do not get stuck because of being limited. Keep yourself alive. Build and give me the full and complete feature, verified, tested, working, with no shortcuts or fallbacks. Product must be usable and ready to go. Pay attention to the little things. Keep design consistent. reuse components and code. keep the codebase organized. keep files small and sorted. keep it readable for a human."

The plan is `trellis-for-one-human-and-many-agents.plan.md` beside this file. This file says how the plan is run.

## The shape

Trellis builds Trellis. The plan is an epic in project TRL. Each plan wave is a wave of the epic. Each plan ticket is a ticket with the contract in its description: the result, the files, the files to leave alone, the verify commands, the review focus, the evidence owed, and the design section it implements. One orchestrator session (this one) creates the tickets, starts the agents, starts the review flow on each pull request, reads the review, merges in dependency order, and deploys.

A worker is a Trellis ticket agent. It runs in its own worktree on its own branch, reads the ticket as its instruction, opens a pull request, links it, and moves the ticket to Agent Review. The worker never merges.

## Where the load goes

Quota at the start, 06:25 UTC:

| Account | Harness | Session window | Weekly | Fable weekly |
| --- | --- | --- | --- | --- |
| Canary enterprise (this session runs here) | claude | 100 percent, resets 07:20 UTC | 44 percent | 84 percent |
| dev.canarytechnologies.com, Max | claude | 0 percent | 72 percent, resets 23:59 UTC | 100 percent |
| n@nvdk.co, Max | claude | 0 percent | 67 percent, resets 09-23 | 100 percent |
| canarytechnologies.com, Business | codex | unlimited | unlimited | none |
| Muse | muse | unknown, no account row | | |

Nine Operator agents of Navid run on the two Claude work accounts at the same time. They keep their share.

Allocation by ticket kind:

| Kind of ticket | Harness and model | Effort | Why |
| --- | --- | --- | --- |
| Server, database, API, poller | codex, `openai/gpt-5.6-sol` | high | unlimited quota; the largest layer |
| CLI verbs and the brief | codex, `openai/gpt-5.6-sol` | high | the same |
| Web pages and UI primitives | claude, `anthropic/claude-opus-5`, the two Max accounts in turn | high | design fidelity; Opus is open on both |
| Docs, the rename sweep, mechanical edits | muse, `meta/muse-spark-1.3` | default | low risk; proves the harness early |
| Judging a hard review, a stuck ticket | claude, `anthropic/claude-fable-5.1`, Canary only | high | Fable is spent on both Max accounts; Canary keeps 16 percent |

Limits: at most three Claude workers at once, at most six Codex workers, at most two Muse workers. Before each start the orchestrator reads `trellis accounts quota <id> --refresh`. A Claude account over 90 percent of its session window gets no new worker; its ticket goes to Codex or waits. The orchestrator itself runs on Canary and keeps its own turns short while the window is spent.

## Keeping the orchestrator alive

- `scratchpad/build/monitor.sh <epic> 1500` runs in the background. Every 90 s it reads the TRL agents and tickets; every 15 min it reads the three Claude quotas. It exits, and so wakes the orchestrator, when a run fails or ends, when a ticket reaches Agent Review or Human Review, when a Claude session window passes 95 percent, or after 25 min as a heartbeat.
- A session cron fires every 29 min as a backstop and asks the orchestrator to check the build if the monitor died.
- Every decision is written to the epic: a comment on the ticket, or a project note under `trellis notes add TRL`. A new session can resume from the epic page and the notes alone.

## One ticket, start to merge

1. Start: `trellis agents start --ticket TRL-n --harness <h> --model <m> --effort high [--account <id>]`. Record the run id in a ticket comment.
2. The worker reads the brief, builds, tests, opens the pull request, links it, writes the summary and the evidence into the pull request body, and moves the ticket to Agent Review.
3. The orchestrator starts the Review flow on the pull request: `POST /flow-executions` with the flow `review`, the ticket, a request id and the flow version. The flow posts findings to Trellis review threads.
4. The orchestrator reads the diff, the findings, and the evidence against the ticket's contract. It checks size, files, tests, the verify record, the screenshots of a frontend change, the one picture of a backend change, and the review focus.
5. A finding that must change code goes back to the same worker as a ticket comment and the ticket moves to In Progress. The worker stays alive while its pull request is in review; a stopped agent cannot resume.
6. A pull request that meets its contract merges on GitHub with a merge commit, in dependency order, after `origin/main` is merged into it and the checks pass. The ticket moves to Done with one outcome sentence in a comment.
7. Every dependent ticket that becomes ready is started at once, within the limits above.

## What the orchestrator never skips

- A pull request without its verify record in the body does not merge.
- A frontend pull request without a before and an after image does not merge.
- A migration lands alone in its wave, generated after the newest tag on main, never renamed.
- `bun scripts/check.ts` is green on the merged tree before the next wave starts.
- A worker that asks a question gets an answer within the monitor cycle.

## Deploy

After the last wave: merge origin/main into a clean checkout, `bun run desktop:install`, quit and reopen Trellis, watch `~/.trellis/desktop-active-release.json` and the restart plan, and check the resumed agents on the project page. Then open the epic page, the review page of one merged pull request, and the ticket page of one ticket in the running product, and compare each with its screen of the proposal. A mid-build deploy happens once, after the epic page wave, so the epic page reads its own build.
