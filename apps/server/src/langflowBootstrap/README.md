# Conditional Langflow startup

`TRELLIS_LANGFLOW_CONFIG_FILE` selects an absolute path to a private JSON file.
The server reads it after database migration and before it serves application requests.
An absent variable leaves Langflow inactive.

The file uses `LangflowBootstrapConfigurationSchema` and requires mode `0600` with the current process owner.
The configuration binds a package, accepted qualification evidence, current host identity, and separate editor origin.
`qualificationSha256` must come from the accepted proof handoff, independently of the selected qualification file.
The `runtime` field uses `QualificationRuntimeSchema` from the release loader.

`loadQualifiedPackage` verifies the selected package and proof against the current data-home identity.
The candidate object retains its candidate qualification.
The separate sidecar manifest contains the qualification established by that proof.
`installedEditorManifest` reads the sealed catalog and template export.
`readEngineConfiguration` checks the original private JSON against the qualified package before image import.
Catalog and source paths must use the sealed `/opt/trellis/inputs` layout inside the container.
The driver receives the digest of those unchanged bytes and checks it on each read.
`importVerifiedOciImage` loads the sealed OCI layout and returns its exact local image identity.
`createOciDriver` receives that image identity and the explicit private configuration paths.

The existing host control identity must match both configured identity fields.
The bootstrap reads the identity again before image import.
The runtime directory is `langflow` below the configured Trellis home.
The capture issuer and engine configuration use separate private files.

`authorityTransport` sends internal authority operations through `ServiceTransport`.
The prepared `langflowHost.authority` service uses `createAuthorityPort` with the worker's real transaction runner.
Each operation checks the expected host and data-home identities.
The service archives the exact committed authority bytes through the host adapter.
The supervisor stops before the server closes its database transport.

The bootstrap fixtures cover absent configuration, private file checks, identity replacement, package refusal, image mismatch, and shutdown.
