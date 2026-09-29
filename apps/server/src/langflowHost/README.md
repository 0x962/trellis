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
`createOciDriver` binds the verified manifest and its image config digest to the saved instance.
It starts the loaded config digest with pull disabled, so a missing local import fails closed.
`importVerifiedOciImage` reloads the sealed package, archives its verified OCI layout, and loads it with no registry pull.
It inspects the expected config digest and returns that digest as the only local image reference for `createOciDriver`.
The import result retains the OCI manifest digest and trusted qualification digest for the caller receipt.
`start` reuses the exact saved container, internal network, and labeled storage after an uncertain response.
It refuses an unknown or conflicting container, network, volume, mount, image, label, or security setting.
The OCI manifest maps `data` to `/data` and maps `run/trellis-secrets/engine-secret` to the read-only encryption file.
The driver builds authenticated health requests from the declared `http`, `127.0.0.1`, and `/trellis-v1/health` values.
The explicit host private root stays separate from the container paths and named volumes.
`observe` checks those current objects before it requests authenticated health for the supplied challenge.
It reports `unknown` when the container manager cannot establish the complete retained state.
An absent PID, a cached health response, or a copied challenge does not prove current ownership.
`stop` checks the same state, removes the exact container and network, and retains the labeled storage volumes.

The runtime uses a read-only root, UID 10001, no added capabilities, no new privileges, and a bounded private tmpfs.
An internal bridge denies external routes, and the published engine port binds only to `127.0.0.1`.
The runtime mounts one writable data volume and one read-only secrets volume.
The storage labels bind both volumes to the data home, host, and a digest of the private host root.
The restricted provisioner copies the exact mode-0600 bearer and capture issuer for UID 10001.
The provisioner creates the persistent encryption secret.
The engine reads the capture issuer from a separate read-only secret file.
Only capture-authority control requests use this file.
The engine receives the immutable home, host, owner, instance, and manifest identity values at startup.
An explicit `engineApiConfigFile` copies one mode-0600 startup file into the read-only secrets volume.
The caller also supplies `engineApiConfigSha256` from its strict package and config validation.
An enabled configuration also requires `nativeReservationAuthenticationFile` for the outgoing Trellis bearer.
The driver copies that separate mode-0600 file to `/run/trellis-secrets/native-reservations.token`.
Only that option sets `TRELLIS_ENGINE_API_CONFIG_FILE`; an omitted option keeps the private API inactive.
The driver compares the original file bytes with that digest before each start, observation, and stop.
The container label binds the same SHA256 to the saved instance.

`createEngineClient` accepts only a private loopback origin and paths under `/trellis-v1`.
It reads the exact bearer file for each operation, refuses redirects, preserves request and response bytes, and returns unknown network results.
Mutation recovery uses one read-only lookup before the mutation and one read-only lookup after an unknown response.

TRL-667 proves isolation; TRL-685 supplies the sealed package adapter.
The focused source fixtures do not prove Docker isolation, authenticated runtime behavior, external egress denial, restart recovery, or volume restore.

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

`DispatchReceiptArchive.open` accepts the identity and `gate.read` from either control.
Compose its terminal reader after both objects exist; only a later settlement calls the reader.

## Initial authority

`new InitialAuthorityIssuer(control, supervisor, archive)` owns the first grant for an execution.
`issue(input)` obtains a fresh observation through `supervisor.withHealthyEngine`.
The input contains the execution, host, project, publication, publication digest, submission digest, exact correlation, expiry, permissions, and held delivery permit.
The producer requires the same target home and host, exact correlation, and an outstanding admission or recovery permit.
It writes epoch 1 and revision 1 with the observed owner and a new capability identifier.
It stores one immutable receipt under the external control directory before it returns.
A repeated request retains that receipt and its original bytes.
A changed owner requires takeover, and a changed request conflicts.

The result contains `id`, `issuanceReceiptId`, `authority`, `authorityBytes`, `authorityDigest`, `observation`, and `correlation`.
`id` identifies the authority archive record.
`readAuthorityBytes(authority)` checks the exact stored authority and returns its original UTF-8 text.
The archive supports this lookup for initial, renewed, and transferred grants after their producer calls `writeAuthority`.
The lookup writes no file and grants no permission to dispatch.
Issuance does not settle the permit; composition retains it through engine delivery and durable acknowledgement.

`readInitial(executionId)` returns the saved issuance record, or null if no issuance exists.
Reconciliation uses this record after a crash before the database binds the grant.
This read grants no authority to issue or dispatch under a changed owner.

## Authority after cancellation

`AuthorityPort.read` returns `canceled` from the durable cancellation intent.
For a canceled execution, renewal and takeover require closed admission and issue only `execution.cancel`.
A saved receipt with broader permissions cannot replay after cancellation.
Takeover retains the closed barrier and original job.
These operations do not change cancellation receipts, native stops, launch receipts, or deadlines.

`AuthorityPort.commit` must recheck the cancellation intent under the execution lock.
A canceled row accepts only cancellation authority and closed admission.
The store must not enqueue admission when it commits that authority.
An outage beyond the old grant expiry still requires current supervisor ownership and the normal renewal or takeover checks.

## Capture authority

`provisionCaptureIssuer(control.identity)` returns the absolute path of the capture issuer key.
The key contains 64 lowercase hexadecimal characters and uses an owner-only file outside the data home.
The OCI driver copies these exact bytes into its separate read-only secret file.
Capture control routes require this key through `X-Trellis-Capture-Issuer` in addition to the private bearer.
Export requests use the grant, not the issuer key.

`new CaptureAuthority(control, supervisor, transport)` uses the full host control and the actual supervisor.
The transport supplies `authenticationFile` and the optional engine client dependencies.
The supervisor supplies the endpoint from each fresh observation.

1. Close the gate with the capture snapshot identifier and await drain outside database transactions.
2. Call `issue({block, boundaryReceiptId})` to save the immutable grant in the dispatch store.
3. Call `commit(record.grantBytes, signal)` to install those exact bytes in the engine ledger.
4. Hold the gate through engine export, the system snapshot, and the durable seal.
5. Call `revoke(record.grantBytes, signal)` and retain its exact revoked receipt.
6. Reconcile the original block with the verified seal and the other required evidence.

The grant binds the exact block, host, data home, owner, engine instance, package digest, snapshot, and boundary receipt.
Its identifier and identity fields use UUIDs; the package digest uses lowercase SHA256.
The snapshot and boundary receipt identifiers are nonempty strings.
`read(id)` returns the retained record after restart.
`lookup(grantBytes, signal)` reads the engine ledger and retains its validated receipt.
An unknown response leaves the grant outstanding and the gate closed.
Revocation intent persists before its remote request.
Reconciliation requires a revoked receipt for every issued grant.

The private routes use `/trellis-v1/capture-authorities`, `/{id}`, and `/{id}/revoke`.
POST bodies contain `{grantBytes}`; GET reads the existing grant.
Receipts contain `{grantBytes,state,receiptId}` with state `active` or `revoked`.
The receipt identifier hashes UTF-8 `JSON.stringify({grantBytes,state})` in that key order.
The engine retains permanent revoked records, including revocation that arrives before a delayed commit.
The engine validator checks the current runtime identity and holds writer exclusion through export.
Its ledger transaction serializes commit and revoke; the host gate remains closed through the final seal.
After a supervised restart, the current instance can revoke an old grant for the same host and data home.
The producer rejects an active receipt or commit for that old instance.

## Requests from the engine

`withAuthenticatedEngine(authorization, operation)` checks the exact bearer for the current engine instance.
It reads the private credential file and obtains a fresh healthy observation before it calls `operation(observation)`.
The supervisor holds its exclusion through this callback.
A short callback can validate the saved authority, acquire a durable permit, and commit the initial claim.
The caller checks the exact archived grant bytes and the execution authority under the database lock.
The caller also compares the observed host and owner with that grant.

The instance bearer differs from the credential for native reservation transport.
A route behind host authentication can carry it in `X-Trellis-Engine-Authorization`.
The callback returns no credential.
After the callback, the durable permit remains held through the provider call and the terminal database commit.
An unknown provider outcome retains the permit for reconciliation.

## Durable supervisor authority

`createAuthorityPort({control, archive, newTx})` connects the supervisor to the migrated ownership queries.
The control supplies its current identity and `gate.read`; it can be an effect-only control.
`newTx` is the service transaction runner.
Each method runs its query in a separate transaction.
Database workers construct the adapter inside a prepared service; the host can call its serializable methods through the service transport.

The database retains the exact `AuthorityCommit`, including original request and authority bytes, observation, and revocation.
After the commit returns, the adapter writes those original authority bytes to `DispatchReceiptArchive`.
A lost response can leave the database committed before this archive write.
`readReceipt` reads the committed record and restores its archive before it returns.
A historical receipt without original bytes cannot supply a reconstructed grant.

Owner revocation retains the first receipt and its original observation identifier.
The supervisor checks that exact receipt through `readRevocation` before it stops the process.
Ownership queries lock the execution before the owner rows and reject revoked grants under the same transaction.
Native stop controls remain available after revocation.

`renew` and `takeover` require a held `permit` in their input.
Call `authorityPermitBinding(intent, engineJobId)` to obtain the exact binding before acquisition.
The intent contains the execution, request, expected revision, and expiry; takeover also contains the expected owner and epoch.
The producer retains that permit in `AuthorityCommit`.
The adapter checks the outstanding permit and its exact intent before it writes ownership.
A permit acquired before a block can complete while the block waits for its terminal evidence.
The caller retains the permit through engine control delivery and durable acknowledgement.
Neither grant issue nor archive recovery settles it.
