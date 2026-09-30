# Native launch capture identity

`withNativeLaunchScope` resolves the actual account or host-default profile and the effective provider environment. It acquires workspace, provider, attempt-retention, exact-attempt, and repository scopes in one call. `nativeWorkspaceUnderExclusion` runs inside that scope. Authorization, prepare, start or resume, and the launch observation remain inside it.

The runtime mutation scopes precede database transactions. A capture caller must finish preliminary identity enumeration before it acquires those scopes. It can revalidate identities in a transaction after it acquires the scope. An exporter must retain the scope through the aggregate seal.

`retainLaunchCapture` allocates a UUID for the selected provider profile. A private record associates that UUID with the harness and canonical profile path. The account ID and path remain separate fields. Each attempt retains `capture.json` before `host.prepare`. The immutable `launch.json` carries the same metadata in `spec.capture` and the request fingerprint.

Readable roots contain conversation directories: Claude projects, Codex active and archived sessions, Pi sessions, and Muse sessions. Provider lock paths also include the selected profile and the prior profile paths on resume. Shared symbolic links remain explicit. The runtime producer refuses unsupported external roots. OpenCode requires a separately retained export; its launch metadata has an empty readable-root list.

Historical descriptors without capture metadata remain unavailable. Custom launches preserve their existing launch behavior and remain without provider capture metadata. Neither case receives a guessed profile or conversation identity.

`readNativeCaptureIdentity(home, attemptId)` reads the immutable descriptor and inspects the same attempt through `nativeClient(home)`. It returns `{state:"retained",identity,workspaceId}` or `{state:"unavailable",reason}`. It requires matching attempt, harness, and workspace identities. The observed provider session belongs to that exact attempt. This result supplies enumeration input; the runtime capture producer must revalidate it under the held batch scope.

Synthetic fixtures cover metadata replay, changed selections, profile identity, private modes, historical absence, and explicit shared roots. They do not prove provider isolation, process exclusion, or a completed archive.
