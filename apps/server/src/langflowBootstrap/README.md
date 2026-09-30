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
The supervisor retains one outgoing callback credential for each engine instance.
The driver receives that credential and its digest with the saved instance identity.
The engine configuration uses `/run/trellis-secrets/native-reservations.token` as its container path.

`authorityTransport` sends internal authority operations through `ServiceTransport`.
The prepared `langflowHost.authority` service uses `createAuthorityPort` with the worker's real transaction runner.
Each operation checks the expected host and data-home identities.
The service archives the exact committed authority bytes through the host adapter.
The supervisor stops before the server closes its database transport.

The bootstrap fixtures cover absent configuration, private file checks, identity replacement, package refusal, image mismatch, and shutdown.

`authorityPolicy` supplies `durationMs` and `renewBeforeMs` for saved grants.
`authorityPermissions` supplies the explicit permission list for initial grants.
The bootstrap requires both fields and retains the existing gate state.

`createLangflowConnections` connects admission, decisions, native observation, stops, authority recovery, and projection.
The worker registry holds each domain's actual database services.
The host owns the supervisor, engine clients, receipt archive, and lifecycle signal.
The native worker uses `recordWorkspace` and `createNativeDispatchGate` for committed evidence.
`langflowHost.authority` also carries the exact archived initial binding through the real transaction.

The lifecycle requests retained recovery at startup and after each completed pass.
It uses the existing repeating-call clock and runs domains in order.
The wrapped service transport notifies the domain after a successful action returns.
A rejected action leaves its durable obligation for retained recovery.
Shutdown aborts and awaits domain calls before native callbacks, supervisor, and database transport close.

`pauseOrdinary` returns a held scope after ordinary domain calls finish.
Stops continue until that scope calls `freezeStops`.
Both phases retain queued notices for `resume`.
The reconciliation owner holds this scope alongside the engine, native, and database exclusions.

`nativePolicy` optionally supplies an absolute `path` and an independently trusted `sha256` for a private policy file.
The file requires mode `0600` and the current process owner.
Document actions read the completed receipt before they access that file or the supervisor.
Conversion and edit actions verify the original file digest while the supervisor holds the current engine.
`retainNativePolicy` stores the original bytes and host identity under the external control directory in `native-policy-configurations`.
The worker receives those bytes and the expected digest through the internal service transport.
`createTrustedConversionProducer` checks the exact effective source and qualified package on each compile or regeneration.
A changed source requires its own trusted policy configuration.
Missing policies retain the compiler diagnostics for native nodes.
