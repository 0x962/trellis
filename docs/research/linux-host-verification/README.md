# Linux host integration verification

This directory records the verification contract for the Linux host integration branches.
The workflow source is `.github/workflows/linux-host-integration.yml`.
The workflow scripts are in `scripts/linux-integration/`.

## Branch trigger

The workflow runs after a push to one of these branches:

- `integration/linux-host`
- `integration/linux-connection`
- `integration/linux-client`
- `integration/linux-operations`
- `integration/linux-verification`
- `integration/linux-system`

The workflow has no `pull_request` trigger.
Feature branches do not run the integration suite.
One concurrency group applies to each integration branch.
A newer push cancels the older run for the same branch.

## Check contract

The workflow publishes these check contexts:

- `Plan / Select integration lane`
- `Lint / Repository`
- `Typecheck / linux-x64`
- `Typecheck / linux-arm64`
- `Typecheck / macos-x64`
- `Typecheck / macos-arm64`
- `Test / linux-x64`
- `Test / linux-arm64`
- `Test / macos-x64`
- `Test / macos-arm64`
- `Package / linux-x64`
- `Package / linux-arm64`
- `Package / macos-x64`
- `Package / macos-arm64`
- `Smoke / debian-x64`
- `Smoke / rocky-x64`
- `Smoke / alpine-x64`
- `Latitude / protected-x64`
- `Evidence / Index`

The lint job runs `bun run lint` on Linux x64.
Each type-check job runs `bun run typecheck` and `bun run typecheck:repo`.
Each job installs the locked dependency tree with `bun install --frozen-lockfile`.
Each branch selects its focused commands from the checked-in lane plan.
The workflow grants `contents: read` and no write permission.

The distribution job uses hosted Linux for bounded Debian, Rocky, and Alpine container checks.
The workflow contains no untrusted job for a privileged runner.
The Latitude runner path stays inactive until Navid supplies and protects that runner.

## Evidence artifact

The final job runs after all required jobs, including a failed job.
It uploads one artifact with this identity:

`trellis-evidence-<lane>-<commit>-<run-id>-<attempt>`

The artifact contains `evidence.json` and `evidence.md`.
Each document records these fields:

- branch and lane
- exact commit
- workflow run ID and attempt
- check name
- command
- runner label
- operating system and architecture
- result
- platform gap

The JSON document uses `schemaVersion: 1`.
The Markdown document gives the same facts in a human-readable index.
A failed check stays failed.
An unavailable platform stays unverified.
The evidence job does not convert either state to passed.
The evidence job fails while a required result is failed or unverified.

## Platform gaps

The hosted matrix covers Linux x64, Linux arm64, macOS x64, and macOS arm64.
The distribution smoke covers only the commands in the current lane plan.
The Latitude host remains unverified until the protected machine exists.
The system integration ticket owns live hardware proof and cross-lane proof.

## Lane inputs

The host lane requires focused coverage for these paths:

- `apps/runtime/src`
- `packages/runtime-protocol/src`
- `apps/server/src/agents/native`
- `apps/server/src/hostShell`
- `packages/api/src/hostRelease`
- `packages/cli/src/host/linuxService`
- `scripts/host-release`
- `scripts/host-service`
- `deploy/linux-container`

The host lane will supply its exact package command and test files after review.
The OCI proof stays unverified until its member results exist.

The client lane will supply its reviewed test and package commands after its member results exist.
Its focused scope includes desktop, web host, desktop adapter, `NativeTerminal`, `ProjectDirectorySettings`, session notification, and internal-link tests.
TRL-530 supplies the client package commands.
The Linux desktop X11, Wayland, and secure credential storage proofs stay unverified until their required environments exist.
