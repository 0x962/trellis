# Composed HTTP journey

`run.ts` drives the registered V1 HTTP routes on an isolated host supplied by TRL-696.
The host uses the real engine, authority, component, native, and human-decision paths.
The caller supplies deterministic native execution without provider credentials.
The runner starts from an existing published Langflow document.
It checks start, human decisions, cancellation, terminal state, and exact retained output.

The runner is authored source. It has no execution result.
The existing Bun service fixtures remain a separate proof category.
Full acceptance requires every row in `reports/langflow-integration-evidence/acceptance.md`.

## Required inputs

`batchInput/BatchInputSchema` defines the input JSON.
Use absolute paths for the input file and a new evidence directory.
Use mode `0600` for the input JSON, authentication file, and bootstrap configuration.
The authentication file contains only the public host bearer token.
The runner never prints or retains request headers.

| Field | Producer and meaning |
| --- | --- |
| `sourceRevision` | Exact clean repository revision for the combined batch |
| `qualification` | TRL-685 package identity and TRL-667 independent qualification digest, through the public `LoadQualifiedPackageInputSchema` |
| `apiOrigin`, `actor`, `authenticationFile` | TRL-696 isolated public HTTP host and authorized human actor |
| `deadlineAt`, `pollIntervalMs`, `requestTimeoutMs` | Explicit batch deadline, read interval, and HTTP timeout in milliseconds |
| `prerequisites.bootstrapConfiguration` | Exact TRL-994 configuration path and SHA256 |
| `prerequisites.bootReceipt` | Owner evidence that this isolated origin uses this package, configuration, data home, and process identity |
| `prerequisites.nativeAdapterReceipt` | Owner evidence for the deterministic native account, actual runtime dispatch, and denied provider access |
| `prerequisites.cleanupCommandFile` | Owner-supplied shutdown command and exact process verification procedure |
| `prerequisites.matchedSeries` | TRL-674 final source manifest, including components, prompts, groups, loops, and engine patches |
| `scenarios` | Named published documents, exact start inputs, expected identities, decisions, occurrences, outputs, and terminal states |

Each prerequisite reference contains `path` and `sha256`.
The runner checks those bytes. A matching hash does not establish the truth of an owner receipt.
The qualification loader checks the independent proof and the complete sealed package.
The runner compares the configuration identity with that loader input.
TRL-667 must accept the boot, native, and cleanup receipts before invocation.
The runner does not infer them from a URL or a candidate directory.

Each scenario supplies `ticketId`, `projectId`, and `documentHash` for exact comparisons.
Each expected visit names `nodeId`, `phase`, and the complete `iterationPath`.
Its `parentVisit` is either the exact parent visit or null.
Each output expectation contains its SHA256, or null for a null output.
`nativeResult: true` requires one exited attempt, a session identity, and exact retained output through HTTP.
Include every expected occurrence, including skipped branches.
Extra, missing, or duplicate visits fail the assertion.

Decisions name their visit, approval, and full output text.
The runner posts each decision once at its observed human wait and current revision.
Each listed decision must have one confirmed receipt at the end.
For a cancellation scenario, `cancelAt` names a running or human-waiting visit.
Use null when the scenario must finish without cancellation.
The cancellation target must remain observable until the HTTP poll reaches it.
Controlled crash and race probes require the engine owner's exact fault controls.

## Invocation after the hold ends

Use the actual TRL-994 boot command after its dependencies and receipts exist.
Set `TRELLIS_LANGFLOW_CONFIG_FILE` to its absolute private JSON path before the host starts.
The bootstrap owner supplies the other host settings and isolated home.
An OCI image entrypoint alone does not start the composed Trellis host.

From the matched repository root, run once:

```sh
bun run integrations/langflow/tests/system/composed/run.ts "$BATCH_INPUT" "$BATCH_EVIDENCE"
```

The input paths and scenario names have no defaults.
The source must be clean and match `sourceRevision`.
The runner refuses a missing prerequisite or an existing evidence directory.
It writes private request and response records before and after each HTTP call.
An uncertain mutation ends the invocation and retains `transport_unknown`.
An exact terminal start replay is an explicit assertion, not a transport retry.

The runner polls through pending stop obligations until confirmed exit or the supplied deadline.
An expired deadline leaves the execution active and retains its request record.
The caller must execute the owner's cleanup procedure after success, failure, or interruption.
Retain the exact process and attempt exit receipts beside the HTTP evidence.
Never stop an unrelated process or remove a shared container.

`http-assertions.json` records only these HTTP assertions.
It leaves cleanup, engineering acceptance, browser acceptance, and installed acceptance unverified.
If that file is absent, retain the partial evidence and the command failure.
Keep raw responses private because documents and outputs can contain private Review text.

## Remaining producer and proof boundaries

The bootstrap, sealed package, native adapter, and converted scenario documents need actual producer receipts.
Save, publication, and conversion through the complete user journey require their public entrypoints.
Direct document service calls cannot supply that proof.
Fault injection, negative authentication, event replay, readiness policy, and restore need their required probes.
The runner asserts observed occurrence identity; independent review still checks that Langflow alone selects successors.
Browser and installed checks use the same matched batch through their own tools.
The batch procedure is in `reports/langflow-integration-evidence/batch.md`.
