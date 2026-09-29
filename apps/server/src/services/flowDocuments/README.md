# Saved documents and publications

`get(ctx, tx, { flow })` returns the current `FlowDocumentV1` and its publication state.
`save(ctx, tx, input)` accepts `FlowDocumentSaveV1Input` and returns its first saved receipt.
The caller commits the supplied transaction before it requests publication.

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
The legacy graph routes refuse a Langflow document with `FLOW_UNSUPPORTED_FORMAT`.
Metadata updates and legacy graph saves preserve immutable revisions through the same version counter.

The focused fixtures use in-memory storage and an injected engine client.
They cover receipt replay, version races, format refusal, engine failure, validation refusal, and late publication results.
They do not prove real engine validation, browser draft recovery, isolation, or installed-host behavior.
