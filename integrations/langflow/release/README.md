# Langflow package assembly

`sealPackage` copies a prepared Linux OCI candidate into a new package directory.
`verifyPackage` checks its bytes against an expected package digest supplied by the caller.
Both operations use local files only.

`loadCandidatePackage(root, expectedPackageId): Promise<CandidatePackage>` is the read-only composition interface.
The barrel `integrations/langflow/release/index.ts` exports its function and type.
It returns `enginePackageDigest`, `componentManifestHash`, `targetArchitecture`, `engine`, `editor`, and `manifestPath`.
`engine` contains `layoutDirectory`, `image`, and `imageDigest`.
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
