The real Claude test completed one scratch code task after it exposed a controller failure. Claude 2.1.270 ran one manager and one worker. The operator approved 23 specific tool requests. This was a supervised test.

The manager reached `MANAGER_IDLE` before RAT-1 existed. The new ticket event woke that manager automatically. The manager started one worker with a stable request ID. The worker produced `slug.ts` and `slug.test.ts`, ran a retained check, registered both artifacts, and posted its evidence.

The controller sent another event while the manager awaited tool permission. Claude acknowledged that event after the response deadline. The dispatch remained `unknown` and blocked later events, although its durable receipt existed. Commit `1cebc785` adds a readiness gate and confirms late receipts without another send.

A host-only restart preserved the runtime process, both agent runs, both execution attempts, and the workspace. The original dispatch changed to `sent` with its generation unchanged. The complete raw Claude output contained one acknowledgement for that message UUID. The manager then consumed the worker result, posted `READY_FOR_LOCAL_REVIEW`, and became idle. All four dispatch records were `sent`.

| Evidence | Result |
|---|---|
| Scratch project | RAT, ticket RAT-1 |
| Manager | `01M2GQ1BBT7RAJHC9GJF27HV0P` |
| Worker | `01M2GQ3MQ4B2KN4GKV53X2CJJW` |
| Retained check | `5178cacf-d5b1-4223-8e2f-4fb3fb3f7710` |
| Worker check | `bun test slug.test.ts`: 5 tests, 9 assertions, exit 0 |
| Independent checks | Same test command plus 12 separate input/output cases, all passed |
| Artifacts | Two current files; stored hashes match the file bytes |
| Review comment | `01M2GQQKFX003YBWESQ7ZEXQNC` |
| Final model state | Both idle, no pending permissions |
| Queue | No pending, sending, or unknown dispatches |
| Ticket status | In Progress; the fixture requests a local review comment, not a status move |
| Controller regressions | 21 tests, 52 assertions passed |

Read [result.json](./result.json) for the machine-checked assertions and timestamps. Read [permissions.jsonl](./permissions.jsonl) for every approved operation. The source copies preserve the artifact bytes. Read [slug.ts](./slug.ts.txt) and the [independent checks](./independent.ts.txt).

The test used a private `/tmp/trl-real-pj5t0w` home and a source CLI shim. A scratch Claude launcher added `--safe-mode --no-session-persistence`; normal installed authentication remained in use. The host retained transcripts and results. This test does not certify Claude conversation resume after a runtime restart. It created no real pull request and changed no live project or user configuration.

The manual tools sit under `apps/server/test/manual/`. Run `realAcceptance.ts setup`, inspect each `status`, and pass each reviewed request to `permission`. Create the ticket only after the initial idle result. `restartAcceptance.ts` restarts only the scratch host. `captureAcceptance.ts <scratch-root> <output-directory>` captures assertions and artifacts. `realAcceptance.ts stop <scratch-root>` stops the scratch agents, runtime, and host.

After capture, the scratch host and both agent processes exited. The runtime removed its manifest. The scratch files remain available for inspection.
