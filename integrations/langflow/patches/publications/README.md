# Immutable publications

`files/` contains the engine source for `0001-immutable-publications.patch`.
`buildPatch.py <pinned-engine-source>` rebuilds the patch without edits to that source.
Apply it after the backend and schema fragments in the Langflow patch series.
Engine migration `8c0f2d5b3e7a` follows `7b9e1c4a2d6f`.
The migration adds the receipt ledger and protects ledger rows and published flows from updates and deletes.
Trellis migrations remain unchanged.

`create_publication_router(package, require_transport_auth=...)` returns the domain router under `/publications`.
The shared API owner mounts it under `/trellis-v1` and supplies its required transport-auth dependency.
The factory belongs to `langflow.api.v1.trellis_publications`.
The bootstrap supplies `InstalledPublicationPackage` from `langflow.services.trellis_publications.contracts`.
Its fields are `engine_package_digest`, `component_manifest_hash`, `engine_commit`, `catalog_path`, `trellis_root`, `engine_root`, and `user_id`.
The verified package supplies the digests, source roots, and catalog path.
The supervisor supplies the private authentication file and the existing engine service user.
The file must be a regular file with mode 0600.
Each call supplies its exact content through `Authorization: Bearer <content>`.
The shared API owner leaves this domain unavailable until the package and authentication are configured.

Both POST routes accept deterministic JSON with `enginePackageDigest`, `snapshot`, and `sourceBytes`.
`snapshot` is the immutable Langflow `FlowDocumentSnapshotV1`.
`sourceBytes` is the base64 encoding of the retained source.
`POST /validate` returns `{diagnostics: FlowDiagnosticV1[]}`.
`POST` to the prefix without a trailing slash returns `FlowPublicationV1`.
`GET /{flowId}/{revision}` returns `{publication, snapshot, sourceBytes, requestDigest}`.
The digest covers the exact POST body bytes.
The receipt key is the immutable flow ID and revision.
An equal request returns its original receipt; different bytes conflict with HTTP 409.
An absent GET returns HTTP 404.

Publication checks the exact source digest, installed package, catalog, component code, templates, and graph semantics.
Only declared input values can differ from an approved installed template.
The engine parses the graph without component constructors and sorts its vertices without execution.
A catalog entry must explicitly permit publication and supply its complete frontend template.
The current TRL-845 catalog permits no entries, so actual publication remains blocked.
The publisher never changes that catalog to produce a passing result.

The engine flow and receipt commit in one engine transaction.
A database uniqueness conflict can return only the exact committed receipt.
The database prevents later writes to the published flow, including writes from stock flow routes.
Existing runs retain that engine flow and its immutable snapshot.
Publication cannot itself authorize a native attempt or an occurrence.

`installedPublisher` supplies the concrete TypeScript HTTP producer.
`publicationDispatch` consumes the durable host gate.
A retained permit authorizes only a GET for recovery, including after dispatch closes.
A missing receipt leaves the permit unresolved.
Only a fresh permit can authorize a POST.
`readTerminal` verifies the stored request digest and publication receipt before the host settles a permit.
The runtime composition must archive its evidence as required by the host gate.

TRL-667 runs `python -m pytest integrations/langflow/tests/publications` in the matched engine environment after the patch merges.
Set `TRELLIS_PUBLICATION_ENGINE_ROOT` to that environment's pinned source root.
The storage test injects graph validation to isolate atomic receipts and database triggers.
It does not establish component acceptance.
The catalog test reads the real source and verifies refusal of an unapproved component.
HTTP bootstrap, OCI mounting, positive catalog acceptance, and PostgreSQL migration execution require integrated proof.
