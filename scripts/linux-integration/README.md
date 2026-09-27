# Linux integration checks

The workflow runs only after a push to one of the six Linux integration branches.
It does not run for a feature pull request.

Each lane starts with no focused test, package, smoke, or Latitude command.
A lane owner supplies each command after review.
A missing command records an unverified result and a reason.

Add each reviewed lane input under `integratedInputs`.
Each lane plan requires at least one integrated input.
Record the ticket, diff, reviewed head, source head, lane commit, review run, review result, and findings.
Copy the raw Trellis flow status into `reviewResult`.
Only `succeeded` is a successful review result.
Resolve every finding before the input can pass.
Prove ancestry from the reviewed head to the source head, lane commit, and workflow head.
A missing feature flow stays unverified.
A review waiver does not supply a successful feature flow.

Add an optional complete-lane Review under `laneReview`.
Keep its diff, commit identities, raw result, and findings separate from each feature input.
The lane Review can add coverage for a feature source.
It cannot change the feature review result.

Add a focused test command under `focusedTests.<platform>`.
Add a package command under `packages.<platform>`.
The package command writes all package files to `$TRELLIS_PACKAGE_OUTPUT`.

Use `integratedInput` to bind a command to its reviewed ticket input.
Use `requiredPaths` to name every source path that the command needs.
A missing input or path records an unverified result and fails the check.

Add a smoke image and command under `smoke.<platform>`.
Pin the image to an immutable digest.
The runner starts the container without a network.
The runner also limits CPU, memory, and process use.

Add a Latitude command under `latitude.protected-x64`.
The job also requires the protected `linux-latitude` environment.
Set the `TRELLIS_LATITUDE_ENABLED` repository variable to enable the job.

The integration owner verifies the change through GitHub Actions. Do not run these commands in a ticket worktree.

1. Merge the ticket-linked pull request into its lane with a merge commit.
2. Confirm that the plan names the exact branch and commit.
3. Read each matrix check and its result artifact.
4. Download `trellis-evidence-<lane>-<sha>-<run-id>-<attempt>`.
5. Confirm that each required platform reads passed, failed, or unverified.
6. Keep every failed or unverified result in the ticket evidence.
