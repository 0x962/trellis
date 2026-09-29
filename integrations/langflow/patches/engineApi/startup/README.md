# Private engine API startup

This fragment registers the private engine API in the pinned Langflow application.
`TRELLIS_ENGINE_API_CONFIG_FILE` is the sole activation variable.
An absent variable keeps the private API inactive.
An enabled configuration must be an absolute, owner-matched mode-0600 file.

The configuration has these exact fields:

- `version`: `1`
- `enginePackageDigest`
- `componentManifestHash`
- `engineCommit`
- `catalogPath`
- `trellisRoot`
- `engineRoot`
- `userId`
- `exportRoot`

The caller supplies the selected sealed package paths and a service-user UUID.
The caller supplies a private export root outside the sealed package and the job database.
The startup code resolves those exact paths and has no host checkout fallback.

Startup creates the private capture ledger under `/data/config/trellis-capture`.
It constructs `CaptureBoundary` and immediately calls `install_capture_boundary(boundary)`.
It then constructs the Langflow services and all private domain routers.
The capture revoke route completes `resume_after_capture()` before it returns.

One common router mounts these relative domains under `/trellis-v1`:

- `/publications`
- `/admission`
- `/decisions`
- `/native`
- `/cancellation`
- `/snapshots`
- `/capture-authorities`

The common router authenticates every request with the exact bearer file.
Capture control also requires the separate capture issuer file.
The lifespan waits for database initialization, replays committed cancellation effects, and runs one deferred writer recovery pass before normal startup continues.

Apply this fragment after the publication, authority, admission, decision, native, cancellation, backup, and capture-writer fragments.
The source fixture covers inactive startup and complete configuration parsing.
The fixture remains unexecuted while the host capacity hold applies.
Container startup, route execution, writer exclusion, recovery, installation, and activation remain unverified.
