# Linux OCI candidate source

This builder prepares an unqualified Linux image from the pinned Langflow source and the current local patch series.
The image uses CPython 3.12.12 and uv 0.12.7 through immutable multi-platform image digests.
The root frozen `uv.lock` selects the `langflow-base` package and its PostgreSQL extra.
The builder installs Linux dependencies inside Docker. It creates no host Python environment.

`prepareCandidate` requires the clean upstream commit and tree from `series.json`.
It verifies each patch digest before it applies that patch to an exported source copy.
It rejects a changed Python lock and checks every editor asset against the retained manifest.
The source checkout and retained assets remain unchanged.
The exported source archive, patches, locks, MIT notice, and editor inventory remain in `context/inputs/`.
The image retains these inputs under `/opt/trellis/inputs/`.

Use these commands from the repository root:

```sh
candidate_root=$(bun integrations/langflow/release/oci/prepareCandidate/prepareCandidate.ts \
  /path/to/retained/source \
  /path/to/runs/editor-ea605f26/built-assets \
  /path/to/runs/editor-ea605f26/build-files.sha256)
bun integrations/langflow/release/oci/buildCandidate/buildCandidate.ts "$candidate_root" arm64
```

`prepareCandidate` creates one directory under `$TMPDIR` with the `trellis-langflow-oci-` prefix.
It prints that path to stderr after creation and to stdout after preparation succeeds.
The caller owns that directory and removes it after evidence retention.
An error keeps the directory for inspection. No command removes shared caches or other candidates.

Before a build, check host capacity and coordinate the shared engine with TRL-667.
Use the existing Docker engine and an authorized BuildKit builder with OCI export support.
Set `BUILDX_BUILDER` to select that builder without a global selection change.
The default Docker driver rejects the OCI export on the current OrbStack engine.
The build command never starts an engine or creates a builder.
Build `x86_64` in hosted CI with the same inputs after the arm64 proof.
The architecture argument uses `x86_64`; Docker receives `linux/amd64`.
No command pushes or loads an image, starts a container, or edits an installer.

The build exports `<architecture>/oci-layout/` with one OCI image manifest.
It disables SBOM and provenance attestations because the package verifier accepts one image descriptor.
The `candidate-build.json` record names the image digest and hashes every exported blob.
The record retains candidate status and the exact source, patch, lock, and editor identities.
The separate `build-evidence/` export contains the installed Python distribution inventory and frozen lock.
Docker reuses its dependency cache for this export.

The package assembler consumes the image layout and measured inputs through `PackageRecipe`.
The build record is not a package recipe or a release seal.
A caller must supply the actual restricted component catalog and its source files before package assembly.
A caller must retain the listed inputs and exclude build logs from the package payload.
The release sealer verifies every referenced file and the single image manifest.

The runtime image uses UID and GID 10001.
Its entrypoint sets umask 077 and starts the installed `langflow` command.
The default command listens on container loopback at port 7860 with one worker.
The default database, configuration, secret files, home, and cache use `/data`.
The image creates private directories for that user. An external mount must preserve those permissions.
The image disables automatic login and telemetry.
It embeds no runtime secrets, data-home identity, ownership epoch, or provider credentials.

The lifecycle driver must supply private storage and enforce read-only root, denied external egress, and authenticated access.
The driver must also establish exact process identity, durable ownership, health, and confirmed exit.
Container loopback is not a host endpoint. The driver must define its private transport before runtime admission.
An app restart does not prove that an older native runtime stopped.

The supplied editor assets are fixture evidence with patch identity `ec23fcc90f8e9799c323716a453ca52f5b4438cf3d0734b3908e1291c179d5d1`.
Their manifest digest is `0fac70e2c411ad288be1161a03b7062bcf78633c93b7ad8d4381f95cac880748`.
They do not establish approved editor behavior or restricted components.
The image includes upstream components. Runtime admission must remain closed until the component restriction proof passes.

The builder needs network access to fetch the pinned bases and locked dependencies on a cache miss.
Runtime dependencies reside in the image, but an offline start still requires execution proof.
Upstream source distributions can select build tools outside `uv.lock` through their build-system declarations.
Repeated byte-identical builds, source-build dependency pins, platform libraries, isolation, and native session retention remain unverified.
No successful source build qualifies a target for production.

## Hosted x86_64 candidate

`.github/workflows/langflow-package-candidate.yml` accepts a draft release tag and two SHA256 values.
The release in the same repository holds `prepared-context.tar.gz` and `arm64-proof.json`.
The archive contains the exported `context/` directory with regular files and directories only.
The workflow verifies both hashes and rejects paths outside that directory.
It also checks the Dockerfile and entrypoint against its checked-out source.
Actions, Bun, Buildx, BuildKit, Python, uv, and the loader dependency use exact pins.

The arm64 proof receipt has this shape:

```json
{
  "schemaVersion": 1,
  "qualification": "candidate",
  "architecture": "arm64",
  "contextSha256": "<prepared-context.tar.gz SHA256>",
  "result": "passed",
  "checks": {
    "offlineStart": "passed",
    "readOnlyRoot": "passed",
    "privateData": "passed",
    "deniedEgress": "passed",
    "nativeSessionRetention": "passed"
  }
}
```

The isolation owner writes this receipt from actual arm64 results and supplies its trusted hash.
A package build alone cannot produce a passed receipt.
The workflow exports `langflow-x86_64-candidate` as a CI artifact.
That artifact retains candidate status and still requires x86_64 runtime proof.
