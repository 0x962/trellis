# TRL-697 source checkpoint

PRs 679 and 682 add thirteen cases that compose public services over production migrations.
At `c24a7854f0e510c07bfa3117a4a14590e901ee0e`, all thirteen cases pass with 72 assertions.
The fixture and server type checks pass. Biome passes on eight files.
Seven attachments on TRL-697 retain the source identity, commands, results, and repaired initial type failure.

## Cancellation view source

TRL-916 adds two cases against the merged `cancelView` and `saveStopState` services.
The cases compose document publication, start reservation, human decisions, and public cancellation over real migrations.
One case verifies a stale cancellation revision, a view reread, and replay with the current revision.
It requires the original cancellation identity and complete decision and outbox records to remain unchanged.
The other case aborts after the public cancellation view changes inside the transaction.
It requires the prior committed decision, public revision, and outbox records to survive without a cancellation or emitted event.

These two cases remain unexecuted during the capacity hold.
Their source baseline is `9829efc96a`.
Tests and type checks must run on the merged batch after capacity returns.
The earlier thirteen-case result does not cover this source or the newer dependencies.
No native process, engine, HTTP server, or provider runs in these cases.

## Initial producer handoff

TRL-696 reported these gaps before the first fixture checkpoint on September 29:

- The document publisher has no actual engine transport.
- The V1 start, decision, and cancellation routes are absent.
- The trusted host identifier and qualified engine transport lack concrete producers.
- Cancellation returns intent and outstanding-stop state; its public view still needs composition.
- The migration stack and PR 639 now merge into main. PR 636 supplies the remaining projection repair.

The merged source now supplies cancellation-to-view composition and an installed publisher adapter.
Their presence does not establish actual transport or engine acceptance.
TRL-868 remains In Progress without a linked diff at the source inspection.
TRL-696 owns its public mutation routes and mounted HTTP proof.

The system fixtures use the existing fixture publisher and synthetic engine receipt data.
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
