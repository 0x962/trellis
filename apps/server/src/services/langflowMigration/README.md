# Conversion source reports

`prepareMigration({exportDirectory, sourceBytes, targetEngineVersion})` exports a supplied copy of a legacy `FlowDoc`.
The caller supplies an existing private directory and the original UTF-8 JSON bytes.
The operation creates a unique directory with mode 0700 and writes `source.json` with mode 0600 before it parses the document.
The operation writes `report.json` with mode 0600 and returns the same report.
An invalid JSON document or missing flow identity throws after the source export remains on disk.

`MigrationRecordV1` extends the storage owner's `DocumentConversionProvenance` with source identity and a source manifest.
The source digest covers the exact exported bytes, including whitespace.
Each manifest row retains its ID, document order, complete JSON digest, and one digest for each field.
Field and row digests use `flowDocuments/documentBytes`: sorted object keys, original array order, and original strings.
Instruction and briefing digests cover their exact UTF-8 text without JSON quotes or normalization.
Null values and absent optional fields remain distinct.
The manifest records independent root entries from the shared `entryNodes` implementation.
Document order records output order; it creates no execution edge.

Unknown fields and unsupported source values produce separate diagnostics with source paths.
The original export retains all bytes even when source validation prevents a manifest.
Known documents receive a diagnostic for every node and edge without a production mapping.
The production catalog blocker also applies to empty graphs.
Every current result is `blocked`, with empty target maps and a null target digest.
The source manifests describe source identities only.

TRL-669 and TRL-672 confirm that the editor catalog and recorded Review components are fixtures.
Production conversion requires executable components, complete field mappings, exact port handles, and accepted semantic proof.
The converter must preserve metadata, prompts, parent links, order, layout, harness settings, branches, Jev settings, deadlines, rounds, and defaults.
The production publication service must validate the target against the installed engine and catalog before approval.
The storage contract reserves `converted`, `approved`, and `activated` states for those later results.

`checkMigrationSource(record, current)` checks both the retained export and a fresh source read against the report.
`current` carries the flow ID, version, and bytes from that read.
Any changed identity, version, or byte digest invalidates the review.
An empty diagnostic list establishes source equality only; it does not authorize publication or activation.
The activation owner must read and compare the source under its transaction lock and commit the conversion atomically.
Live conversion and activation belong to TRL-699.

`prepareMigration` accepts optional `catalogBytes` from the caller's selected component manifest.
It retains these exact bytes in a private `catalog.json` and records its path and SHA256 in `record.catalog`.
The version-1 catalog supplies node selectors, blocker descriptions, and source-field destinations.
Reports identify missing or ambiguous selectors, absent field destinations, and engine-version mismatches.
Executable helper components alone do not establish a complete legacy mapping.
Every catalog-backed report remains blocked, including a catalog that claims publication support.
The caller must provide current `catalogBytes` to `checkMigrationSource` when the report contains a catalog.
A changed retained copy, changed current bytes, or an absent current catalog invalidates that report.

These operations use explicit copies and private files.
The caller owns export retention and must retain the source before it removes any temporary directory.
For retained execution snapshots, export only the available snapshot and retain its original execution record separately.
Browser drafts require their own export and recovery path.
Missing historical versions require an explicit inventory gap.

`prepareConversionIntake` accepts the same source inputs plus required `catalogBytes` and `expansionBytes`.
The producer supplies `{graphDocument, nodeSpecs}` as UTF-8 JSON bytes.
Each association contains `sourceNodeId`, `engineNodeId`, `definitionId`, `phase`, and `specNamespace`.
The namespace is `trellisRequestSpecsV1` for native or human requests, or `trellisReviewGatesV1` for Jev.
The producer supplies all graph vertices, ports, edges, static entries, and group or loop metadata.
Each vertex must exist once and name its catalog class through `data.type`.
Group expansion associations belong to the producer's graph metadata; request associations identify only vertices with static request entries.

The intake writes the original producer bytes to private `expansion.json` before it parses them.
It preserves catalog blockers and appends diagnostics for invalid associations and unresolved harness or instruction policy.
A structurally consistent candidate receives `trellisConversionV1` and a separate private `candidate.json`.
The envelope retains the original source bytes as base64, with the flow ID, version, SHA256, and catalog digest.
Its `nodeSpecs` contains the supplied associations plus `sourceNodeHash` and `specHash`.
The source bytes retain every field, original string, array order, null value, and absent optional field.
The candidate digest identifies this private graph copy; the migration record retains a null target digest and blocked state.
`intake.json` records the combined diagnostics and file digests.

TRL-886 owns `trellisRequestSpecsV1[engineNodeId]` and its strict static schema.
The fields are `nodeId`, `taskKeyBase`, `name`, `instruction`, `harness`, and optional `accountId`.
Native harnesses require retained launch commands; human entries can retain null.
The producer must resolve launch policy before publication.
The intake compares explicit source harness fields with those retained values and keeps unresolved policy blocked.
TRL-986 owns `trellisReviewGatesV1[engineNodeId]`, with `nodeId` and `reviewArea`.
Each association references SHA256 of `documentBytes(original entry)`.
Provenance fields stay outside this hash.
The intake preserves static instructions exactly; prompt assembly remains a producer requirement before executable conversion.

`readConversionBinding(verified, visit)` consumes the publication and graph from `flowDocuments.readExecutionPublication`.
Call that shared reader with the locked execution before this provenance reader.
The visit supplies a trusted engine node ID, phase, and namespace from the engine checkpoint.
The provenance reader verifies the original source bytes, identity, node hash, and shared specification hash.
It returns the association, original source node, and original flow metadata.
The domain reader still validates its static schema and catalog class.
The native resolver still verifies authority, the complete engine occurrence, input receipts, and deadlines.
Dynamic occurrence keys, loop rounds, receipts, and launch-time context come from those trusted runtime operations.

`checkConversionIntake(intake, current)` checks source and catalog equality through `checkMigrationSource`.
It also checks retained expansion and candidate digests and the current producer bytes.
The activation owner must perform the source read and recheck under the document lock before any future conversion write.
An unchanged intake remains blocked until executable mappings and integrated proof exist.

The focused commands are:

```sh
bun test --config apps/server/src/langflowContracts/fixtures/bunfig.toml integrations/langflow/tests/conversion/sourceReport.test.ts
TRELLIS_REVIEW_V71_RUN=<private-export> bun test --config apps/server/src/langflowContracts/fixtures/bunfig.toml integrations/langflow/tests/conversion/reviewV71.test.ts
bun run typecheck # From apps/server
bunx --no-install tsc --noEmit -p integrations/langflow/tests/conversion/tsconfig.json
bun test --config apps/server/src/langflowContracts/fixtures/bunfig.toml integrations/langflow/tests/conversion/conversionIntake.test.ts
```

Review v71 fixtures read the private export through `TRELLIS_REVIEW_V71_RUN`.
The repository retains only the existing public digest manifest.
Fixture proof covers export retention and loss reports; ENG-F8 runtime parity and complete ENG-F15 migration remain separate requirements.
