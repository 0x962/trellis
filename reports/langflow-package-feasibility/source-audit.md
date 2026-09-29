# Langflow package feasibility

## Result

The macOS arm64 candidate starts offline and binds only to a private listener.
It passes the named credential, external network, private write, and loopback checks.
It does not pass complete filesystem isolation because the policy permits unnamed same-user reads.
No platform is an approved release target from this result.

`macos-arm64-candidate.json` contains the measured values in machine-readable form.
The candidate root is:

```text
/var/folders/zc/q6614tmx3tx362p94vvrfn0w0000gn/T/trellis-langflow-fec71dca-py312-macos-arm64
```

TRL-667 owns this root and its cleanup.
Other feasibility owners can inspect its retained source and evidence as read-only data.

Navid ended the per-ticket serial probe queue on 29 September 2026.
The candidate remains unchanged for integrated verification after the complete Langflow merge.

## Source and lock

Langflow v1.12.3 points to commit `fec71dca901949c09ed4d63315804337cd2eb13d`.
The commit points to tree `e6ac634257b30645b6c35bcc707ed271789877d6`.
The tree has 10,348 blobs and 221,460,956 blob bytes.

The 134,686,169-byte source archive has SHA256 `22121d494f34b6dfda669295e26b8cab475b4642fe9f86273f39e19a1a6cb4bd`.
The archive took 76.97 seconds to download.
The shallow checkout took 167.59 seconds and allocated 374,148 KiB.
Its Git data allocated 132,904 KiB.

The root package requires Python `>=3.10,<3.15` and uses the MIT license.
Its `pyproject.toml` SHA256 is `5be1f33e9f57e4c288fca1c24b7940c5f8d28e4d9d8ba3b08ddb09b9c4bc3b52`.
The 3,121,723-byte `uv.lock` SHA256 is `05a1b07666e3342047587c8bf0badb42ac46ec2680b56da9ca9a65da03b941f8`.
The lock has 832 records, with 803 registry records and 29 editable workspace records.

The frontend tree has 3,033 blobs and 49,419,577 blob bytes.
Its `package.json` SHA256 is `98ab8e80045a2be58ec6f51a0152be6820f62ee41a0e02d7b812f1f7219018cc`.
Its 788,094-byte lock SHA256 is `bfe4497cb1566b6a89f62c68df5133619821a524e0f2297f405db01966664277`.

## Package cost

The Python candidate uses CPython 3.12.12 on macOS arm64.
The frozen dry run resolved 455 packages in 0.12 seconds.
The install took 97.73 seconds and used 614,088,704 bytes of peak RSS.
The environment allocated 1,368,332 KiB, and the `uv` cache allocated 1,891,692 KiB.
The locked build path also allocated 795,228 KiB in the private home.

The environment inventory SHA256 is `d17199cda84fb9c291e92021cb2813199f25bab755f5f09d083ed547f224f9b1`.
The inventory uses `uv 0.12.7` with this exact command:

```sh
/opt/homebrew/bin/uv pip freeze --python "$CANDIDATE/venv/bin/python" | LC_ALL=C sort | /usr/bin/shasum -a 256
```

An earlier `pip freeze` command produced a different text digest for the same environment.
The difference came from the package name and editable path format.
All later comparisons use the `uv` command above.

The `langflow` import resolves to the pinned source with SHA256 `2640ccd02bc383d597eb8dc998f2767b56d76ce5934b9159a5f41083c1e7095e`.
The `lfx` import resolves to the pinned source with SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

The frontend lock requires Node `>=20.19.0`.
The candidate used Node 26.5.1, while upstream CI uses Node 22.
This version difference remains an installed-target gap.

The frozen npm dry run resolved 1,428 packages in 0.86 seconds.
The npm install took 40.46 seconds and used 554,287,104 bytes of peak RSS.
`node_modules` allocated 1,103,604 KiB, and the npm cache allocated 184,368 KiB.

The baseline frontend build took 28.36 seconds.
It used 3,897,720,832 bytes of peak RSS.
The build has 1,880 files, 24,672,326 logical bytes, and 30,668 allocated KiB.
The sorted asset manifest SHA256 is `686ca6c158c516e2fa38fc2ac0edc797971222a53d60450ce087d1f9d6eed031`.

The build reports mixed breakpoint units, mixed static and dynamic imports, and chunks over 500 kB.
These warnings did not stop the candidate build.

## Rejected editor candidate

The rejected editor patch SHA256 is `77ac765396b54d04b82d72e755d01b921ffdeb5763cdf7fedd513b5d69ebb8db`.
Its preimage manifest SHA256 is `381f1647550d114ea418a3780df8e6dc7f85e306973d65862afc6d5bbd16fa84`.
The patch changes nine frontend paths.

The pinned Biome 2.1.1 check passed on all nine paths.
The full TypeScript check reported 253 diagnostics in 87 files on the clean tree and the patched tree.
A normalized comparison used the file, TypeScript code, and full diagnostic message.
It found zero added diagnostics, zero removed diagnostics, and zero source-position shifts.

The patched build took 28.77 seconds and used 3,594,403,840 bytes of peak RSS.
It has 1,894 files, 24,522,316 logical bytes, and 30,572 allocated KiB.
The sorted asset manifest SHA256 is `3d26afd8ace4e8c31b3bda0a4b9c54274740a80880c59e8e757a3702ac2d9e46`.
The build retained the baseline warnings about breakpoint units, mixed imports, and large chunks.

The normalized diagnostic artifact is in the retained candidate run directory.
Its SHA256 is `c8b48f296260c867a084d0af517e4170adea2216bcb817d10ce66e5be40a1258`.
The build did not start an editor process.
The probe route can show an empty canvas because probe mode hides the only active flow-list initializer.
This source gap rejects the build even though its static checks pass.
The replacement editor runtime and HTTP checks remain pending.

A later replacement patch has SHA256 `a5f94d6e207b98be2a2a44e1e26b4d8d25f6b327108ebe8817ca639224941ab2`.
Source review found that its gateway accepts a wrong component manifest hash and changed component authority.
TRL-667 retained the bytes as rejected source evidence and did not apply the patch.
No build, listener, or browser probe used those bytes.

## Startup and private listener

The runtime used a new private SQLite data home.
It received no production data or external credential.
The sandbox permits loopback TCP and denies tested external TCP.

| Probe | Health | Startup | RSS | Listener |
| --- | --- | ---: | ---: | --- |
| Cold | 200 | 30.603 s | 886,194,176 bytes | `127.0.0.1:52320` |
| Warm | 200 | 30.040 s | 856,899,584 bytes | `127.0.0.1:52855` |

Both processes exited with status 0 after the health check.
The runtime logs show failed remote refresh attempts and local fallback data.
The health route stayed available at `/health_check` without external network access.

The accepted probe profile SHA256 is `b7063726bd55d4d4ea42cae32fd30a4becea23fd729868d39c5e9199d3a0182c`.
The profile denies the fixture credential and the named credential roots.
It permits writes only below the private run root, except for `/dev/null`.
Its `file-read*` rule permits reads of other same-user files.

The policy uses Apple `sandbox-exec`, which is not a supported product API.
The candidate therefore fails the complete filesystem isolation gate.
Environment removal alone also fails because the unconfined fixture reads the credential and uses the network.

## Concrete isolation proposal

Carry one Linux OCI target into the next feasibility review.
Use an OCI runtime that supports the standard Linux configuration fields for namespaces, mounts, devices, resources, and seccomp.
The [OCI runtime configuration](https://github.com/opencontainers/runtime-spec/blob/main/config.md) defines a read-only root filesystem and explicit mounts.
The [OCI Linux configuration](https://github.com/opencontainers/runtime-spec/blob/main/config-linux.md) defines the Linux namespaces and seccomp configuration.

Use these read-only paths inside the container:

- `/opt/trellis-langflow/runtime` for the Python environment;
- `/opt/trellis-langflow/source` for the pinned source and patches;
- `/opt/trellis-langflow/editor` for the built editor assets;
- `/opt/trellis-langflow/licenses` for the license files.

Use these writable paths only:

- `/var/lib/trellis/langflow/<dataHomeId>` for one private data home;
- `/run/trellis/langflow/<dataHomeId>` for private temporary and run data.

Mount `/run/secrets/trellis-langflow-encryption` as one read-only secret file reference.

Set the root filesystem to read-only.
Mount no user home, repository, host credential directory, or production data path.
Use separate user, mount, PID, IPC, UTS, and network namespaces.
Drop every Linux capability and set `noNewPrivileges`.
Use the runtime seccomp policy and the host security module when the selected runtime supports them.

The sidecar can listen inside its network namespace.
Publish its one HTTP port only on host address `127.0.0.1`.
Give the namespace no default external route and no DNS configuration.
Use a host egress rule to deny any remaining non-loopback route.
The network namespace alone does not prove outbound denial.

This proposal does not approve a Linux or OCI target.
The next proof must select one runtime and verify its actual mount table, namespaces, capabilities, seccomp state, listener, and outbound denial.
It must run on Linux x86_64 and arm64.
It must also run the Alpine-container label for a compatible non-glibc host.

Apple documents the [App Sandbox](https://developer.apple.com/documentation/security/protecting-user-data-with-app-sandbox) as the supported macOS isolation mechanism.
The supported native proposal requires a signed App Sandbox helper with an app container and explicit read-only file grants.
Apple's [network server entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.server) permits incoming network connections.
It does not prove that the helper accepts only host loopback connections.
No macOS native target can pass until a supported policy proves that loopback boundary.

The `macos-loopback.sb` result remains failed evidence.
Do not use it as a release policy.

## Shared window integrity

The source verifier records the private patch SHA256 before each mutation.
It checks the reverse apply against the active source.
It records tracked and untracked overlay paths, modes, and content digests.
It rejects an overlay path that the private patch does not own.
It rejects a symbolic link or another non-regular patch path.

The candidate is clean at commit `fec71dca901949c09ed4d63315804337cd2eb13d` and tree `e6ac634257b30645b6c35bcc707ed271789877d6`.
Its empty status and binary diff both have SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

The immutable TRL-670 ledger window ran 11 focused tests.
Ten tests passed, and one test failed on one timestamp byte form.
The expected `recordedAt` value ended in `.000Z`, while the observed value ended in `Z`.
The window reversed its exact private patch and restored the clean source.

The retained TRL-668 and TRL-669 composition has SHA256 `23ec0871323484f671df9ffc1c9a0bf6a4c00b1171b82314e545225f3050513b`.
Source review found a fresh-lease recovery defect before execution.
A failed lease claim returns normally, and the code then consumes the decision obligation before dispatch.
This result rejects the composition.

Even without that defect, the composition can prove method-level job, admission, and runner behavior only.
Its startup hook imports the TRL-670 decision ledger, which the assembly does not contain.
It cannot prove service startup, restart, or the full decision path.
Do not stub that import.

The retained TRL-669 fixture bytes match immutable manifest SHA256 `c50d331982b7c08259b8a0bcecedd48988c6d72d74116433ce75c866100a211c`.
Later edits in the author worktree do not change this held input.
Keep these bytes as rejected source evidence.
Do not execute them.

## Manifest boundary

`sidecarManifest.ts` defines a strict version 1 manifest.
The manifest includes these values:

- source, patch, lock, component, editor asset, and license digests;
- the exact Python version and target;
- one private root and one data home;
- a file reference for the encryption secret;
- a loopback HTTP health contract;
- one owner, epoch, and lease for the same data home.

The schema rejects extra fields, a public listener, an embedded secret, and a second data home.
The schema defines no graph, text, item, payload, round, or deadline ceiling.

## Target matrix

| Target | State | Evidence and limit |
| --- | --- | --- |
| macOS 26.6.2 arm64, CPython 3.12.12 | candidate | The frozen install, build, offline start, private listener, and partial isolation checks pass. Complete filesystem isolation fails. |
| Linux x86_64, kernel 5.14, glibc 2.28 | unverified | The target also requires libstdc++ 6.0.25 and libatomic. No hosted probe exists. |
| Linux arm64, kernel 5.14, glibc 2.28 | unverified | The target also requires libstdc++ 6.0.25 and libatomic. No hosted probe exists. |
| OCI on compatible non-glibc hosts | unverified | This candidate includes Alpine hosts. No image build or hosted probe exists. |
| macOS x86_64 | unsupported by this result | No target owner or probe exists. |
| Windows | unsupported by this result | The current Trellis plan does not claim Windows. |

Future Linux smoke labels are Debian or Ubuntu, Fedora or Rocky, and Alpine-container.
TRL-536 owns any Linux package handoff.
TRL-540 owns any CI plan or workflow change.
TRL-538 owns any desktop staging handoff.

## Commands

The candidate used these command forms:

```sh
git clone --depth 1 --branch v1.12.3 https://github.com/langflow-ai/langflow.git "$SOURCE"
uv sync --package langflow --no-dev --frozen --python 3.12 --python-preference only-system
cd "$SOURCE/src/frontend" && npm ci --ignore-scripts --no-audit --no-fund
cd "$SOURCE/src/frontend" && npm run build
PYTHONDONTWRITEBYTECODE=1 "$PYTHON" integrations/langflow/package-probe/runtimeProbe.py --candidate "$CANDIDATE" --repository "$REPOSITORY"
/opt/homebrew/bin/uv pip freeze --python "$CANDIDATE/venv/bin/python" | LC_ALL=C sort | /usr/bin/shasum -a 256
LANGFLOW_PYTHON="$CANDIDATE/venv/bin/python" bun run --cwd integrations/langflow/package-probe test
bun run --cwd integrations/langflow/package-probe typecheck
/Users/navidkhan/projects/trellis/node_modules/.bin/biome check integrations/langflow/package-probe
```

The exact install command also set a private home, cache, and temporary directory.
It disabled keyring access and Python downloads.
The frontend command disabled browser downloads.

The integrated patch run also uses `assertPinnedImports.py` with these required values:

- the candidate source path;
- the private patch path and its expected SHA256;
- the expected commit, binary diff SHA256, and lock SHA256;
- the `langflow` and `lfx` package names;
- the patch directory when the patch applies below the repository root.

The verifier first checks that the exact patch can reverse from the active source.
It then records each owned overlay path, status, mode, and file SHA256.

## Verification status

Before the workflow change, the focused package run passed six Bun tests and two Python tests.
The package type check also exited with status 0.
Those checks covered the first overlay verifier repair.

The final source adds normalized manifest paths and a verifier rule for non-regular files.
No check ran after those edits.
Navid requires the next test, build, probe, browser check, and Review flow after the complete Langflow merge.
Root owns that integrated verification.

No per-ticket engine or editor probe remains queued.
The retained candidate and snapshots stay unchanged until the integrated run.

## Remaining decisions and limits

| Decision | Current evidence |
| --- | --- |
| First release target | No target is approved. Select Linux OCI x86_64, Linux OCI arm64, or both. |
| OCI runtime and egress control | Select the runtime and the host rule that denies non-loopback traffic. |
| macOS native target | Defer it or fund a signed App Sandbox helper with a proved loopback boundary. |
| Node version | Pin upstream Node 22 or qualify the measured Node 26 candidate. |
| Hosted target proof | Supply the Linux hosts and Alpine-container image for the required smoke labels. |

ENG-F11 remains incomplete because the candidate permits arbitrary Python and unnamed same-user file reads.
ENG-F17 remains incomplete because no installed recovery, upgrade, rollback, Linux, or OCI proof exists.
No production install, provider call, credential, cloud resource, Linux package edit, CI change, or release action occurred.
