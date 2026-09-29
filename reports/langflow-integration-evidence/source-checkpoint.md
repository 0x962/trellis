# TRL-697 source checkpoint

The source adds thirteen cases that compose public services over production migrations.
The cases remain unexecuted before the complete source batch, per the assignment instruction.
Biome passes on the eight TypeScript/JSON files. `git diff --check` passes.
Type checks, focused execution, CI, integrated browser checks, and installed proof remain unverified.
No environment, dependency, engine candidate, server, build, or provider call starts for this checkpoint.

## Producer gaps

TRL-696 confirms these gaps on September 29:

- The document publisher has no actual engine transport.
- The V1 start, decision, and cancellation routes are absent.
- The trusted host identifier and qualified engine transport lack concrete producers.
- Cancellation returns intent and outstanding-stop state; its public view still needs composition.
- The migration stack and PR 639 now merge into main. PR 636 supplies the remaining projection repair.

The source uses the existing fixture publisher and synthetic engine receipt data.
Those inputs permit service assertions. They establish no engine, graph, host, or UI acceptance.

TRL-674 supplies the current engine handoff at fixture source `4a46a87d6b9aefad94351e28ffac4f3ed00ac69e`.
That handoff records fifteen passes, one loop failure, and three PostgreSQL skips.
The loop raises `KeyError feedbackPath`. The earlier marker result does not establish this changed fixture.
These are owner-reported results, not executions from TRL-697.
All complete F1-F8 and F20-F22 gates remain open.

The accepted budgets and full engineering/UI requirements remain in `acceptance.md`.
Note `01M3QANZR50GFPPAA20W1ADENE` supplies the current D1, D13, and D15 decisions.
D1 proceeds with the bounded maintained patch and retains every engine proof gate.
D13 retains durable milestones and receipts through the existing history lifecycle.
Cursors follow retained records; token streams remain separate.
D15 covers desktop, narrow web, CLI, and agent CLI. Native-mobile flow UI stays outside this replacement.
Principal retains D16 cutover and rollback timing after restore proof.
D12 selects Linux OCI arm64, then hosted x86_64. No accepted OCI isolation proof exists at this checkpoint.
