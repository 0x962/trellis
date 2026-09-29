# Cancellation connection

`createStopConnection` connects the HTTP host to system-only worker services through `StopStateCall`. TRL-696 registers `stopState` with ServiceTransport and calls `committed({executionId})` after cancellation commits. Startup reconciliation calls `recover()`. The host supplies its shutdown signal and awaits outstanding calls.

The connection enumerates every unconfirmed stop and pending engine cancellation for its host, including publicly canceled executions. It also recovers unfinished cancellation permits from the external authority directory. Native stops run before engine delivery during recovery. An engine outage, expired grant, or closed dispatch gate does not prevent native stop calls.

Each native stop holds `withAttemptOperation(home, attemptId)` through the runtime call and database confirmation. The same lock protects native launch submission. A matching runtime ID, exited state, and exit time form the required proof. An absent runtime record or different attempt retains an unresolved obligation. `settleNativeStop` commits the exact obligation and public `needsStop` in one worker transaction.

The engine adapter posts exact intent and authority bytes to `/trellis-v1/cancellation`. It validates the returned request, execution, job, and intent digest. The engine acknowledgement remains separate from native exit. HTTP errors, lost responses, and invalid receipts never become acceptance.

The pinned engine status values are queued, in_progress, suspended, completed, failed, cancelled, and timed_out. The last four are terminal. Nonterminal acceptance stays in recovery. A terminal engine failure remains a failure in the retained acknowledgement. This connection does not rewrite graph status or select successors.

`confirmCancellation` persists the exact acknowledgement in the cancel outbox. The external receipt archive stores terminal engine proof before the dispatch gate settles its permit. A crash after the database commit leaves enough data to settle that permit during recovery. Native stops retain their own proof and obligations.

`readCancellationReceipt(ctx, tx, {executionId})` returns the intent, acknowledgement, exact stops, and `needsStop`. A canceled start with no saved job needs lookup-only association recovery from TRL-687. An uncertain reservation without a saved handle needs TRL-688 reconciliation. Neither case permits another graph submission or an inferred native exit.

The focused fixtures use a controlled HTTP endpoint, migrated database, real receipt archive, and simulated runtime responses. They do not prove actual Langflow or process termination. Tests, linters, imports, builds, and Review remain deferred until the complete source batch.
