# Persistent agent research

Reviewed on 2026-09-15. Local source baseline: `23de0f70`.

Next step: [durable next actions for the manager](../manager-next-actions-plan.md). The first proposed slice covers tickets that wait for worker capacity.

This review covers public engineering reports, official documentation, and source repositories.
Stripe and Ramp describe production use. Cursor and Anthropic describe experiments as well as infrastructure.
Documentation establishes a mechanism's intended behavior, not its measured effect on productivity.
Reported adoption and throughput numbers below come from each builder; this review does not independently reproduce them.

The recurring design combines durable work state, explicit next actions, event delivery, and bounded agent tasks.
The sources also show failures from excessive coordination, repeated checks, and obsolete instructions.
This synthesis does not establish one optimal architecture.

| Builder or system | Mechanism and evidence | Limits |
| --- | --- | --- |
| Anthropic: long-running harness, November 2025 | An initializer creates a feature list, environment script, progress file, and Git baseline. Later sessions select one feature, verify behavior, and leave a recoverable result. This addresses premature completion and expensive reconstruction of prior work. [Engineering report](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Web application experiments. The report does not establish that multiple specialized agents always outperform one worker. |
| Geoffrey Huntley: Ralph, July 2025 | A shell loop gives the agent its plan and specification again. Each iteration handles one task. Huntley describes prompt changes based on observed failures. [Author's explanation](https://ghuntley.com/ralph/) | A continuation technique and practitioner report. An infinite loop alone supplies no quota control, ownership protocol, or completion proof. |
| Cursor: autonomous codebases, February 2026 | Shared coordination locks caused contention. An overloaded executor also stalled. The final reported design separates planners from workers and returns worker handoffs to the responsible planner. Cursor removed a central integrator after it became a bottleneck. [Engineering report](https://cursor.com/blog/self-driving-codebases) | The browser was a research project with accepted imperfections. Commit throughput does not establish production quality or human time saved. |
| Anthropic: Managed Agents, April 2026 | The session log, harness, and execution sandbox have separate lifecycles. A replacement harness reads durable events and resumes the session. [Infrastructure report](https://www.anthropic.com/engineering/managed-agents) | Recovery must preserve the work identity. This design does not justify discarding a user's conversation. |
| OpenClaw: account and model failover | Configured account profiles have an order, session preference, cooldown state, and eligibility rules. A rate limit can trigger another eligible profile. The runtime records a provider's reset time when available. Explicit model selection remains distinct from account rotation. [Failover documentation](https://docs.openclaw.ai/concepts/model-failover) | This is documented runtime behavior. It does not prove that two accounts have independent allowances or authorize a paid fallback. |
| OpenClaw: heartbeat | The scheduler owns periodic turns. Task completion can also wake the relevant session. The system supports lightweight context, silent results, and skips for empty monitor work. [Heartbeat documentation](https://docs.openclaw.ai/gateway/heartbeat) | A heartbeat provides an opportunity to act. It does not itself establish task progress. |
| OpenHands: stalled agents | A detector compares repeated actions, observations, errors, and messages. It ignores superficial differences such as event IDs. The runtime can stop an unproductive loop. [Guide](https://docs.openhands.dev/sdk/guides/agent-stuck-detector), [source](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/conversation/stuck_detector.py) | Detection and recovery are separate decisions. Legitimate repeated observation of a long command needs different treatment from repeated failed actions. |
| Stripe: Minions, February 2026 | Code-defined workflows combine fixed steps with agent steps. Local checks precede CI. A run gets at most two CI rounds before human scrutiny. Stripe reports over 1,300 fully agent-written, human-reviewed PRs merged each week. [Engineering report](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2) | These are bounded task agents inside a persistent service. Stripe's two-round limit reflects its own costs and workflow. |
| Ramp: Inspect, January 2026 | Prepared sandbox snapshots remove clone and dependency setup from session startup. Agents have tests, telemetry, feature flags, browser access, and previews. Ramp tracks sessions that produce merged PRs and reports about 30% of merged frontend/backend PRs from Inspect. [Engineering report](https://builders.ramp.com/post/why-we-built-our-background-agent) | Adoption is not a controlled productivity comparison. Environment preparation can still be a useful target for elapsed-time measurements. |
| Anthropic: application harness, March 2026 | A separate evaluator checks explicit acceptance criteria against the application. After a model upgrade, the author removed sprint boundaries and moved evaluation to the end of the build. [Experiment report](https://www.anthropic.com/engineering/harness-design-long-running-apps) | The author reports that evaluator value depends on task difficulty and model capability. More review stages can add overhead. |
| LangGraph: human decisions | An interrupt stores workflow state and waits for an explicit resume value. The same thread ID selects the saved state. Code before the interrupt executes again on resume. [Interrupt documentation](https://docs.langchain.com/oss/python/langgraph/interrupts) | A timeout is not approval. Actions before an interrupt need safe repeat behavior or a separate execution boundary. |
| Beads Viewer: task priority | The project exposes machine-readable task recommendations from dependencies, critical paths, declared priority, and other graph signals. It identifies quick wins and work that can unblock other tasks. [Project documentation](https://github.com/Dicklesworthstone/beads_viewer_rust) | The documentation describes the algorithm and tests. It does not prove that its scores minimize total completion time. |

**Combined review and merge work**

GitHub merge queues check a candidate against the latest base and preceding queued changes.
The merge-count settings do not combine CI builds. Frequent queue reordering can force rebuilds.
This distinction matters before a manager claims that a larger batch saves checks. [GitHub documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)

Gas Town documents a batch-then-bisect design: check a stack, then narrow a failed batch to identify the failing change.
The same document lists its batch implementation as blocked by an earlier phase.
Treat that section as a design reference, not verified shipped behavior. [Architecture and phase table](https://github.com/gastownhall/gastown/blob/main/docs/design/architecture.md#merge-queue-batch-then-bisect)

**What this checkout already provides**

The existing controller supplies a basis for these ideas:

- [collectHeartbeats.ts](../../apps/server/src/services/controller/collectHeartbeats.ts) uses a one-minute idle threshold and respects pause states and unresolved deliveries.
- [coordination.ts](../../apps/server/src/services/controller/coordination.ts) supplies stable assignment IDs, the persona version, and unfinished dispatches.
- [agentContext.ts](../../apps/server/src/services/controller/agentContext/agentContext.ts) supplies current process observations and bounded tool/result excerpts.
- [current.ts](../../apps/server/src/services/evidence/current.ts) matches check evidence to the attempt, HEAD, and file fingerprint.

These findings concern the source checkout. They do not establish that the installed service uses the same revision.

**Implications for Trellis, based on this research**

The following proposals are inferences for Trellis, not outcomes established by the external reports.

1. Keep the manager's purpose short. Put detailed recovery procedures behind the relevant failure state or worker assignment.
2. Represent a blocker with its cause, owner, next action, and wake condition. Reconcile completion events immediately; use heartbeats to detect missed work.
3. Keep account eligibility, shared quota scope, reset times, and fallback authority in structured state. Avoid repeated credential discovery for each ticket.
4. Rank eligible work by priority, remaining effort, age, and dependency impact. Use proximity to completion as one factor.
5. Detect repeated actions without changed evidence. Give recovery a bounded attempt before a deliberate escalation or another task.
6. Keep deterministic checks and release gates under code control. Give the agent scope to diagnose failures and choose fixes.
7. Separate reversible preferences from required approval. Use a recorded default for the former and a durable wait for the latter.
8. Consider shared checks for compatible candidates while each ticket retains its acceptance evidence. Measure actual check savings and batch delay.

A useful next experiment compares the current manager with these mechanisms on the same recorded scenarios.
Include quota exhaustion, repeated CI failure, a delayed preference, required approval, worker exit, an uncertain delivery, and a final review fix.
Verify the next action and the resulting state, not only whether the prompt contains a rule.

Measure time to human review, blocked time by cause, repeated checks on unchanged work, and human interventions per accepted ticket.
Track regressions alongside speed so a faster handoff does not hide more repair work.

The reviewed sources do not establish that nearest-to-completion priority, automatic account rotation, or combined reviews always maximize useful throughput.
Those remain policies to test against Trellis's workload.
