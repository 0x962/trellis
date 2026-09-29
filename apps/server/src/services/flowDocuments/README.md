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
`publicationDispatch` acquires a durable permit before a new publication request.
It recovers an existing permit through GET only and keeps unknown outcomes unresolved.
The producer exposes `readTerminal` for the dispatch gate's durable evidence reader.
Its optional `recover` method permits receipt recovery for an older saved revision without another engine write.
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
