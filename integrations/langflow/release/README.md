# Langflow package assembly

`sealPackage` copies a prepared Linux OCI candidate into a new package directory.
`verifyPackage` checks its bytes against an expected package digest supplied by the caller.
Both operations use local files only.

`loadCandidatePackage(root, expectedPackageId): Promise<CandidatePackage>` is the read-only composition interface.
The barrel `integrations/langflow/release/index.ts` exports its function and type.
It returns `enginePackageDigest`, `componentManifestHash`, `targetArchitecture`, `engine`, `editor`, and `manifestPath`.
`engine` contains `layoutDirectory`, `image`, `imageDigest`, and `imageConfigDigest`.
`imageDigest` identifies the OCI manifest; `imageConfigDigest` identifies its verified config blob.
The runtime uses the config digest for a local Docker image and retains both identities in its receipt.
`editor.rootDirectory` names the verified editor assets.
Its qualification stays `candidate`; the loader never admits a runtime.

The package contains `package.json` and `payload/`.
The manifest binds all payload files, their sizes, and their SHA256 values.
Its package ID hashes the canonical JSON of `{recipe, files}`.
Object keys and file paths sort by code point. Arrays retain their order.
The package identity excludes file times, file modes, host identities, and secret values.
Copies use private directories and files with modes 0700 and 0600.

The recipe retains the pinned source, ordered patches, both dependency locks, dependency inventory, component sources, editor assets, and MIT notice.
`patchSet.sha256` hashes the canonical JSON of `patchSet.patches`, including each patch directory and order.
`directory` uses `.` for the source root or a normalized relative path.
The caller supplies measurements from the actual build.

`componentSupportFiles` optionally lists catalog dependencies and reader support files.
Each entry binds its payload path, SHA256, and byte size.
The assembler verifies and copies those files with the same rules as component sources.
The caller retains every source dependency and handle source named by the catalog.
An omitted inventory stays absent from the canonical recipe and preserves existing package IDs.
The field records file identity; it does not approve a catalog mapping or alter the loader output.

`stageComponentCatalog` prepares these recipe fields from the original catalog bytes.
It accepts `trellisRoot`, `engineRoot`, `expectedManifestSha256`, `engineCommit`, and a new `output` directory.
The catalog must declare `runtimeSources` as well as definition dependencies and edge-handle sources.
The function verifies all declared hashes and retains original paths below `catalog/trellis` and `catalog/engine`.
Its result contains `components`, `componentSupportFiles`, and absolute `roots` beneath the output for the catalog reader.
The caller copies those recipe fields into the complete package recipe and adds its other measured inputs.
The original manifest retains its publication flags and diagnostics unchanged.
The function checks copied bytes and rejects output beneath either source root.

`frontendTemplates` optionally names the separate `frontend-templates.v1.json` export with its path, hash, and size.
The assembler preserves its original bytes and checks its catalog hash, engine commit, and overlay hash against the recipe.
Supply `recipe.patchSet.sha256` as the exporter's `engine_overlay_sha256` input.
This hash covers the canonical ordered recipe patch records; a source-file aggregate is a different identity.
The loader returns `frontendTemplates: { path, sha256, engineOverlayHash }` with an absolute path, or `null` when absent.
`componentManifestPath` names the verified catalog file; `engineOverlayHash` exposes `recipe.patchSet.sha256` directly.
The installed provider reads the verified artifact and retains its publication blockers and complete template metadata.
The template producer owns the export schema and actual engine trace.

`target.layout` names an OCI image layout inside the payload.
Each package contains one image manifest for one target architecture.
The verifier checks the manifest, config, and layer hashes and sizes against local blobs.
It checks the Linux architecture and requires a nonzero numeric user in the image config.
The accepted layer formats are OCI tar, gzip tar, and zstd tar.
The verifier follows the [OCI layout](https://github.com/opencontainers/image-spec/blob/main/image-layout.md)
and [image manifest](https://github.com/opencontainers/image-spec/blob/main/manifest.md) formats.

Every payload file must belong to a recipe input or a referenced OCI blob.
The assembler rejects symlinks, special files, missing blobs, extra files, and digest mismatches.
It checks the copied bytes before it writes the final manifest.
If assembly fails, the caller retains the incomplete output for inspection and cleanup.

Use these commands from the repository root:

```sh
bun integrations/langflow/release/cli/cli.ts seal STAGING RECIPE_JSON NEW_OUTPUT
bun integrations/langflow/release/cli/cli.ts verify PACKAGE EXPECTED_PACKAGE_SHA256
```

The recipe schema is `packageRecipe/packageRecipe.ts`.
The fixture in `sealPackage/components/packageFixture/packageFixture.ts` illustrates its shape with synthetic bytes.
The fixture image cannot run and proves only the package integrity contract.

All outputs have `qualification: candidate`.
The seal proves byte identity, not source provenance, Python execution, component restrictions, or target support.
Runtime probes must establish those facts for the exact package digest.
The layer verifier hashes compressed blobs; it does not extract or execute them.
The image producer owns filesystem permissions, source application, build reproducibility, and image content.

The supervisor consumes `LangflowSidecarManifestV1` after target qualification.
Its adapter supplies private data, health, encryption-file references, and ownership fields at runtime.
The adapter must retain an independently trusted package digest.
The adapter must verify the package before import or use.
The release owner retains installation, restart, exact process confirmation, and native session retention.

The arm64 OCI candidate build passes with pinned base images.
The restricted component catalog, production editor assets, runtime qualification, and installer adapters remain dependencies.
TRL-667 owns the retained candidate and its environment.
TRL-676 owns the lifecycle interface. TRL-679 owns the editor handoff.
TRL-696 owns composition. Principal owns the production installer.

Run these checks after the source merge batch:

```sh
bun run --cwd integrations/langflow/release test
bun run --cwd integrations/langflow/release typecheck
node_modules/.bin/biome check integrations/langflow/release
```

Hosted candidate builds, offline runtime start, isolation, platform dependencies, and installed session retention remain required under TRL-685.

## Retained qualification proof

`loadQualifiedPackage(input)` verifies a separate qualification record before it derives a supervisor manifest.
Its exports include `LoadQualifiedPackageInputSchema`, `QualificationRuntimeSchema`, and `PackageQualificationSchema` with their types.
The input requires absolute `packageRoot` and `qualificationFile`, `packageId`, `qualificationSha256`, `dataHomeId`, and `runtime`.
The result contains `{ candidate, manifest, qualificationSha256 }`. The candidate keeps its `candidate` qualification.
The derived manifest and its nested values are frozen.

TRL-667 supplies the retained proof after the actual probes pass.
The host configuration must obtain `qualificationSha256` from a separately trusted acceptance record.
The selected proof file and an adjacent checksum cannot establish this trust.
Hash validation establishes byte identity. The acceptance record establishes whether the recorded probes qualify the tested target and scope.
The adapter does not create a real qualification record.

The proof has this shape:

```ts
{
  schemaVersion: 1,
  kind: "trellis-package-qualification",
  subject: { packageId, recipe, imageConfigDigest },
  probes: { isolation, offlineImport, restartRetention, lifecycle, nativeSessionRetention }
}
```

`subject.recipe` contains the complete unchanged `PackageRecipe` from the sealed package.
The adapter compares all recipe fields, the package ID, and the OCI config digest.
This comparison binds the source, patches, locks, image, catalog, template export, editor assets, dependencies, license, and target.
Qualification requires a sealed frontend template export. Its presence preserves all publication blockers.
Patch identity is `recipe.patchSet.sha256`.

Each probe contains `{ command, result: "passed", scope, evidence: { path, sha256, sizeBytes } }`.
An evidence path is relative to the proof file's parent directory. The adapter rejects symbolic links and checks the original evidence bytes.
All five probes are required:

- `isolation`: non-root user, read-only runtime, private writable paths, denied host access, authenticated private endpoint, and denied external egress.
- `offlineImport`: exact package import and startup without downloads.
- `restartRetention`: retained database, encryption secret, identities, and receipts.
- `lifecycle`: health, stop, observed exit, and cleanup of owned processes.
- `nativeSessionRetention`: original session and attempt survive the tested restart without a duplicate launch.

`runtime` contains the sidecar schema's `data`, `encryptionSecret`, `health`, and `epochOwnership` fields.
Both runtime home IDs must equal the explicit `dataHomeId` from `LangflowHostControl.readIdentity(config.home)`.
Runtime paths, secrets, and ownership stay outside the proof subject and package identity.
The supervisor creates its live owner and instance IDs. The manifest's epoch fields do not establish execution authority.
The supervisor's full manifest digest identifies the instance configuration. It differs from the immutable package ID.
