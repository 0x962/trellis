# Manager heartbeat, 2026-09-15

The controller sends a heartbeat after one minute of manager inactivity.
It uses the durable dispatch queue and waits for an idle manager without pending permissions.
Ticket events take priority. Project dispatch pause and global work pause stop heartbeat delivery.
An unknown receipt blocks another delivery until reconciliation or an explicit user action resolves it.
The scheduler does not start another manager.

The current Trellis Manager persona treats every `trellis:` message as a wake.
Its instructions require current ticket and agent reads, delegated code changes, and no duplicate workers.
The heartbeat asks the manager to read that current persona and follow those rules.
It also prohibits routine acknowledgement comments and repeated questions about unchanged blockers.
The queue labels an empty-event delivery as **Heartbeat**.

## Checks

Controller, heartbeat, and native readiness tests: 35 passed, 79 assertions.
Message tests: two passed, eight assertions.
The browser test fails with the old `0 ticket events` label and passes with **Heartbeat**.
The same browser test covers the unknown receipt and resend confirmation.
All nine workspace type checks pass. Biome passes across 2,166 files.
The desktop build and signature verification pass.
The full repository test suite is not repeated.

## Installed verification

Source commit: `c213b3b7`.
Installed release: `67e02619b7bbd1501af2c9f06ab3914d47a1a3b9662f786ebada4f096b5b5a19`.
The authenticated health endpoint returns HTTP 200 with `ok: true` and `gh.ok: true`.
The host runs as PID 92334.

The scheduler sends heartbeat `01M2JVS0QMDRAQ7QNFRW1DXJHK`, generation 50, at 15:43 UTC.
The dispatch has no ticket events and its state is `sent`.
Hana's transcript contains the heartbeat text with message ID `32994cb9-01e0-5c1e-98de-653ba4de6588`.
The harness acknowledges that message ID and enters `working`.
Hana retains PID 21664 and attempt `06c53fa6-5ee4-4803-8f48-c21354d89a8a` across the app replacement.

Verification command: `bun /tmp/trellis-verify-heartbeat.ts`.
Its result is `verified: true`.
Local evidence: `/tmp/trellis-heartbeat-live-verification.json` and `/tmp/trellis-heartbeat-install.log`.
