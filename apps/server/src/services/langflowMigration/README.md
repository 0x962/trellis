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

These operations use explicit copies and private files.
The caller owns export retention and must retain the source before it removes any temporary directory.
For retained execution snapshots, export only the available snapshot and retain its original execution record separately.
Browser drafts require their own export and recovery path.
Missing historical versions require an explicit inventory gap.

The focused commands are:

```sh
bun test --config apps/server/src/langflowContracts/fixtures/bunfig.toml integrations/langflow/tests/conversion/sourceReport.test.ts
TRELLIS_REVIEW_V71_RUN=<private-export> bun test --config apps/server/src/langflowContracts/fixtures/bunfig.toml integrations/langflow/tests/conversion/reviewV71.test.ts
bun run typecheck # From apps/server
bunx --no-install tsc --noEmit -p integrations/langflow/tests/conversion/tsconfig.json
```

Review v71 fixtures read the private export through `TRELLIS_REVIEW_V71_RUN`.
The repository retains only the existing public digest manifest.
Fixture proof covers export retention and loss reports; ENG-F8 runtime parity and complete ENG-F15 migration remain separate requirements.
