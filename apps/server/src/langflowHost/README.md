# Langflow host supervision

`LangflowSupervisor` owns the sidecar lifecycle for one data home.
Composition supplies the OCI driver and the execution-authority store through `SupervisorDependencies`.
The public methods are `open`, `start`, `withHealthyEngine`, `renew`, `takeover`, and `shutdown`.

`open` accepts the TRL-667 manifest schema and requires a verified Linux OCI target with CPython 3.12.12.
The package loader must verify the sealed bytes and target qualification before it supplies this manifest.
The schema's `verified` label alone does not prove those checks.

The supervisor holds a kernel lock on `<home>/langflow/supervisor/trellis.lock` until shutdown confirms the process exit.
The kernel releases this lock after a host crash.
Before launch, the supervisor saves an immutable process identity and a private authentication file.
The identity includes the data home, host, owner, instance, and manifest digest.
The durable data stays in `<home>/langflow/data` across restarts.
Directories use mode 0700, and supervisor files use mode 0600.

A replacement first inspects the saved instance and revokes its authority.
It stops a running instance and requires a new observation of its exit before another launch.
Unknown ownership prevents replacement and successful shutdown.
A failed launch retains its reservation for exact-instance reconciliation.
The next host uses that reservation instead of an unrecorded replacement.

## Driver boundary

`SidecarDriver` is a trusted host adapter, not an endpoint for engine callers.
Its `start` uses the exact saved instance identifier as the OCI container identity.
It must reuse that identity after an uncertain response and never create another container for it.
Its `observe` obtains fresh container identity and an authenticated health response for the supplied challenge.
It must report `unknown` when the container manager cannot establish absence or identity.
An absent PID, a cached health response, or a copied challenge does not prove current ownership.
Its `stop` targets that exact instance and leaves native attempts under the native runtime's control.

The driver must bind the authenticated listener to loopback and enforce the approved isolation profile.
It mounts only the supplied private data and required secret files.
It enforces the manifest's health timeouts and preserves the engine encryption secret across restarts.
TRL-667 proves isolation; TRL-685 supplies the sealed package adapter.
This module contains no OCI adapter or production registration.

## Authority boundary

Publication and start callers use `withHealthyEngine` immediately before their engine operation.
Each call requests a fresh identity and health observation.
History and native stop callers use their existing stores and runtime paths independently of this method.

Only trusted composition receives `renew` and `takeover`.
`ExecutionAuthority` creates the TRL-666 requests and receipts from a live supervisor observation.
Renewal changes the capability and revision, while takeover also advances the epoch and owner.
Open admission receives a new receipt for that epoch with the original job and submission digest.
An equal request identifier returns the original receipt; changed request fields conflict.
These operations receive no deadlines, native provenance, result payloads, or pending completion payloads.

`AuthorityPort` supplies the durable boundary in TRL-683 and TRL-696.
Its methods have these requirements:

- `revokeOwner` commits an owner revocation before it returns. Every dispatch path checks that revocation under its execution lock.
- `readRevocation` returns the stored proof for the exact data home, host, and owner.
- `readReceipt` returns the original committed request bytes, receipt, observation, and revocation.
- `read` returns the execution's current authority and admission.
- `commit` compares the owner, epoch, and revision under the execution lock. It validates the stored revocation and trusted observation.
- `commit` stores the observation, exact request bytes, replacement capability, admission, and receipt in one transaction.
- `commit` refuses renewal for a revoked owner. It preserves native provenance, deadlines, pending results, and completion payloads.
- Dispatch checks the current capability, permissions, expiry, and revocation in the transaction that reserves the effect.

The store adapter must serialize owner revocation with authority commits and effect reservations.
The authenticated transport binds a capability to its grant; a serialized capability identifier grants no access.
TRL-696 owns database-worker transport and lifecycle registration.

## Verification

Run these commands after the merged batch:

```sh
bun test --config apps/server/src/langflowContracts/fixtures/bunfig.toml apps/server/src/langflowHost
bun run --cwd apps/server typecheck
biome check apps/server/src/langflowHost
```

The fixtures use real private files and kernel locks with an in-memory driver and authority store.
They cover competing supervisors, restart data, stale observations, health loss, expiry, revocation, and receipt replay.
They do not establish OCI isolation, durable database CAS, host-crash recovery, installed behavior, or full ENG-F17 and ENG-F21 acceptance.

## Persistent host control

`LangflowHostControl.create({home, evidence})` explicitly initializes authority for a home.
It stores independent UUIDs for `hostId` and `dataHomeId` beside the canonical home.
The directory is `${realpath(home)}.langflow-authority`, with `identity.json` and a `dispatch` subdirectory.
These files stay outside the home and all exported or restored roots.
The first durable state is blocked for initialization.
Trusted reconciliation must establish package, stores, ownership, native attempts, and stops before dispatch opens.

`LangflowHostControl.open({home, evidence})` returns `{identity, gate}` with the saved identities and durable `DispatchGate`.
It refuses missing or invalid state and never initializes a replacement during restart.
Composition stores this control in its trusted context and supplies the same target identity to the supervisor.
A move to another home requires explicit identity adoption and reconciliation before any effects.

`LangflowHostControl.recovery(home)` reads the durable gate for the global recovery query.
An unconfigured home returns `{state: "unavailable", generation: null}`.
A configured home returns `{state: "open" | "blocked", generation: number}`.
Corrupt or incomplete control files fail the read; the query must never report them as open.
The open state is advisory; each mutation still acquires a permit before its first effect.

## Original authority bytes

`ExecutionAuthority` serializes a newly issued grant once in `AuthorityCommit.authorityBytes`.
`AuthorityPort.commit` must save this UTF-8 text atomically with its receipt and ownership transition.
`AuthorityPort.readReceipt` must return the original text on every later read.
`readIssuedAuthority(commit)` checks its parsed grant against the receipt and returns the original bytes and digest.
The HTTP client must send these bytes unchanged to the engine control and domain endpoints.
An old record without retained bytes requires reconciliation; JSONB does not establish the original encoding.

`DispatchReceiptArchive.writeAuthority({authorityBytes, issuanceReceiptId})` retains the original bytes outside restored data.
It returns an immutable archive identifier with the bytes, digest, parsed authority, and issuing receipt identifier.
The trusted producer must retain this archive identifier with its control receipt before it sends the grant.
`readAuthority(id)` returns the original bytes after restart.
The archive checks the target home and host, but the engine must still check current ownership, permissions, expiry, and revocation.

## Access for public effects

`LangflowHostControl.openEffects({home, readTerminal})` returns the saved identity and a `DispatchEffects` instance.
The instance exposes `read`, `acquire`, `recoverPermit`, and `settle`.
Public actions supply the reader that validates their committed terminal evidence.
The instance shares the durable permits with the full control.
A blocked home still permits settlement of an existing effect, so the full control can finish its drain.
Only the full control exposes reconciliation and block management.
