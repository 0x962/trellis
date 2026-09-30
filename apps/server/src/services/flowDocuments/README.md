# Saved documents and publications

`get(ctx, tx, { flow })` returns the current `FlowDocumentV1` and its publication state.
`save(ctx, tx, input)` accepts `FlowDocumentSaveV1Input` and returns its first saved receipt.
The caller commits the supplied transaction before it requests publication.
An ordinary save retains the current engine. An engine change requires explicit conversion.
The save holds the flow row lock through its version check, engine check, and writes.
An exact request replay returns its first receipt before those checks.

Request identity uses deterministic JSON from the complete validated input.
Object keys sort by name. Array order and string content remain unchanged.
The receipt does not identify raw HTTP body bytes.
The immutable source contains the engine, schema version, graph, and component manifest hash.
Each snapshot also retains the metadata at its shared version.

`publishDocument(ctx, { flow, revision }, engine)` reads the saved revision in a short transaction.
It calls the installed engine outside the database transaction.
It then records the exact publication or durable failure diagnostics in another transaction.
An engine failure leaves the saved document intact.
A publication for an older revision remains available to existing runs.

`DocumentPublisher` belongs to the trusted host composition.
Its validator must check installed component hashes, graph semantics, settings, deadlines, and instructions.
Its publisher must create an immutable engine flow and return the same receipt for the same saved revision.
The package and manifest digests identify the installed engine that performs both operations.
The browser cannot supply this client or a publication receipt.
The production sidecar client remains a separate dependency.

`requireCurrentPublication(ctx, tx, { flow, expectedVersion })` supplies the snapshot and publication for a new run.
Call it inside the transaction that reserves the execution.
It rejects an unpublished current revision, even when an older publication exists.
Execution services retain that snapshot and publication for the life of the run.

`createFlowDocumentsV1(handlers)` creates typed procedures for get, save, and view.
It parses the actor header before each handler.
The composition owner supplies transport handlers and registers the router after the document migration.
The execution projection owner supplies view.
`legacyServices` supplies get, save, and update adapters for registration after the document migration.
Its graph adapters refuse a Langflow document with `FLOW_UNSUPPORTED_FORMAT`.
Metadata updates and legacy graph saves preserve immutable revisions through the same version counter.

The focused fixtures use in-memory storage and an injected engine client.
They cover receipt replay, version races, format refusal, engine failure, validation refusal, and late publication results.
They do not prove real engine validation, browser draft recovery, isolation, or installed-host behavior.

`installedPublisher` creates the authenticated HTTP producer from a verified package, live ownership, and the supervisor's private token file.
`publicationDispatch(gate, archive)` acquires a durable permit before a new publication request.
It recovers an existing permit through GET only and keeps unknown outcomes unresolved.
The adapter validates the exact authenticated response against the retained request, document, package, catalog, and permit.
It archives the original request and response text through `DispatchReceiptArchive.writeTerminal`.
The adapter settles the archive terminal ID. A completed permit reads its proof from the archive.
The producer's `recover` method reads an existing permit and never acquires a new permit.
An absent permit or unknown engine receipt returns null.
An older receipt cannot authorize a new run.
The engine fragment and bootstrap contract live in `integrations/langflow/patches/publications/`.
The current catalog has no approved publication definitions.
The replay lookup reads the original request reference before the current slug, so a rename or slug reassignment preserves the first receipt.
## Discovery

`discovery(ctx, tx, input, availability)` returns `DiscoveryResult` from `discovery/types.ts`.
The input uses the existing `FlowListInput` project and ticket filters.
The result contains an explicit engine observation and compact flow summaries.
One batch query reads document, publication, and conversion facts for the listed flows.
The list includes every matching flow.

Composition supplies `DiscoveryAvailability` from the current driver and host control.
An available observation identifies its time, engine package, and component catalog.
A missing observation stays unknown, and a blocked control must report unavailable.
A publication receipt alone cannot establish engine availability.

A new Langflow start requires the current publication and matching observed package and catalog.
The action also requires an actor, as do edit and delete.
Legacy execution authority remains unknown in this Langflow observation.
Conversion stays unknown until a producer establishes an accepted mapping.
A retained blocked conversion report applies only to its source version.

## Installed editor manifest

`installedEditorManifest(candidatePackage)` reads the catalog and optional template export from `loadCandidatePackage` references.
It checks the original file hashes and compares the export with the exact catalog and package overlay hash.
Composition supplies its result through `installedManifest` in the editor session options.
Load the provider once for each verified package identity.
The provider retains catalog blockers and exposes `frontendTemplates: envelope | null` alongside the source manifest.
An absent export permits an empty draft; a component requires its verified native template.

The draft validator permits declared input values, names, descriptions, layout, and supported native presentation controls.
Output selection must name a sealed output and one of its sealed types.
Component code, input metadata, output contracts, and other component metadata must match the sealed template.
A valid draft does not authorize publication, conversion, or execution.
The publisher still applies its independent validation and catalog approval rules.

## Explicit document actions

`activateConversion(ctx, input, services)` captures a legacy document under the flow lock.
The compiler creates a candidate from that immutable source outside the transaction.
`inspectConversionGraph` checks source associations and qualification diagnostics.
`createConversionValidator(base, publisher, savedAt)` binds the candidate to the next revision and the installed publisher.
The final transaction checks the saved source, version, request identity, and installed package again.
A qualified conversion creates a Langflow draft with pending publication.
The original legacy revision remains stored.

`publishSavedDocument(ctx, input, services)` publishes a committed Langflow revision.
The domain stores the exact intent before it calls the engine.
An existing pending intent permits immutable receipt recovery only.
An unknown result returns `{ state: "pending", requestId }` and retains that request identity.
A completed request returns its original `{ requestId, document }` before current version or package checks.
A publication can complete for its captured revision after a newer draft exists.
New runs still require publication of the current revision.

Both operations consume the API-owned identity schemas.
`DocumentActionServices` requires explicit publisher, conversion factory, and installed identity callbacks from the verified host bootstrap.
The conversion factory can return `null`; that result produces blocked diagnostics.
The concrete compiler retains catalog, template, policy, and execution qualification requirements.
Conversion and publication use separate user actions.

`saveConversionEdit(ctx, input, services)` consumes the six-operation edit intent from the API contract.
It preserves the exact validated intent bytes as receipt identity.
Preparation runs outside the transaction, and the final flow lock protects the shared version.
The commit saves generated content, flow briefing, harness, and the original response together.
The preparation result retains the original source and each derived edit in its provenance.

`readDocumentActionReceipt(ctx, tx, { operation, value })` reads the original receipt before host access.
`operation` is `publish`, `convert`, or `edit`. The result distinguishes `completed`, `pending`, and `miss`.
A completed result includes `requestId` and the original `document`; other results include `requestId`.
The lookup requires an actor and locks the flow while it compares the exact intent bytes.
A miss creates no claim. Composition calls this operation before configuration, package, or supervisor access.
After a miss or pending result, the full operation repeats its receipt and version checks under its own transaction.
Only a fresh publication claim permits a POST. A pending claim permits receipt recovery.
