# Runtime failure, 2026-09-15

The host in release `0f834346` leaks a file descriptor for each evidence file hash.
The manager remains alive, but the host cannot reliably run GitHub commands or start another Claude process.

## Evidence

The user reports 12,226 open files on host PID 66954 at about 14:55 UTC.
The investigation repeats `lsof -p 66954 -F ftn` and finds 11,970 paths inside the TRL-15 workspace.
The workspace belongs to run `01M2HHT42K648218A5175VSC0W`.

`hashFile.ts` uses a file-handle stream with `autoClose: false`.
On Bun 1.3.13, the final handle close does not release the stream descriptor.
An isolated child test records 8 descriptors before 128 hashes and 136 afterward.
The fix uses positional reads with a 64 KiB buffer.
The same test records 7 descriptors before and after 128 hashes.
The installed release's Bun binary also passes this regression.

The server log records repeated `JSON Parse error: Unexpected EOF` failures in `gh/detect.ts:43`.
The TRL-15 and TRL-24 builders report failed PR links despite successful GitHub calls from their shells.
The TRL-24 reviewer fails before its process starts because the Claude version command returns empty output.
Later reconciliation replaces this launch error with a missing-attempt error.

The workers retain output. TRL-15 reports PR 23, and TRL-24 reports PR 24.
TRL-16 reports no code change because its cross-root move requires a product decision.
These results remain separate from successful Trellis delivery and review.

## Manager dispatch

The host polls the controller every second after the preceding tick completes.
It sends a manager message only when ticket activity exists and the manager can accept another turn.
A separate one-second loop observes native processes and harness state.
Neither loop sends periodic heartbeat messages to the manager.
The diagnostics observation timestamp records the last changed snapshot, not the last poll.

The saved queue contains 33 sent TRL batches, generations 4 through 36.
Twenty-five batches contain only `agent.harness.needs_input` events.
Automatic approval preserves a pending request until the harness confirms it.
The attention key includes the request identifier, so each new tool request causes another ticket event.
The manager transcript confirms receipt of generation 37 for a ticket created at 15:21 UTC.

## Verification

Evidence, workspace, and hash tests: 18 passed, 60 assertions.
The release-binary hash regression: four passed, seven assertions.
The hash tests cover repeated hashes, multiple buffer reads, empty files, caller-owned handles, and symlink rejection.

The permission fix suppresses attention only after every pending automatic approval succeeds without a retained harness error.
It preserves the snapshot and pending request records.
Manual approval, denied tools, failed delivery, and unknown delivery still produce attention events.
A change to manual approval exposes the same pending request once.
Permission, observation, and controller tests: 39 passed, 102 assertions.
All nine workspace type checks pass. Biome passes across 2,162 files.

The existing stop API can close the reviewer attempt that never starts.
The runtime records a canceled attempt with no process ID and prevents a delayed launch of that attempt.
The stopped assignment preserves its workspace and conversation identifiers.
The launch-error classification and diagnostic overwrite require a separate code correction.
Periodic manager heartbeat messages remain unimplemented.

## Installed verification

The signed app opens release `b04dee19f4464f68e4e2581264bb8b00efaed1aded21caa7e0afd42d74861717`.
The host PID changes from 66954 to 31173.
Its health endpoint returns success.

Five consecutive workspace API reads each hash 1,992 files in the real TRL-15 workspace.
The initial descriptor count is 203. The subsequent counts are 201, 201, 203, 203, and 203.
Every read leaves zero open files inside that workspace.
The same host then reads the full GitHub status for PR 24 successfully.

The manager retains PID 21664 and attempt `06c53fa6-5ee4-4803-8f48-c21354d89a8a`.
The TRL-24 builder retains PID 81393 and attempt `7204db61-bc1b-4704-9241-ac6817fb659b`.
Both processes remain running across the host replacement.

The existing stop API closes reviewer run `01M2JS22052VB0AXJEX5X24WD6`.
Its workspace, session, and attempt identifiers remain unchanged.
The runtime records `Canceled before launch` with no process ID.
The reviewer needs a new assignment to perform the review.

Local evidence: `/tmp/trellis-hash-fix-live-verification.json`, `/tmp/trellis-hash-fix-reviewer-recovery.json`, and `/tmp/trellis-hash-fix-install.log`.
The full repository test suite is not repeated. The focused suites cover both code changes.
