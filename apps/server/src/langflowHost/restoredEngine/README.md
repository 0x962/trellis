# Engine files in an isolated restore

`installRestoredEngine(input, options)` installs the captured database and encryption secret into the OCI driver's named volumes. `verifyRestoredEngine(input, receiptId, options)` reads those destination files again and returns the original receipt.

The input contains `home`, `hostId`, `dataHomeId`, the exact restore `block`, and `qualification`. Qualification uses the actual `loadQualifiedPackage` input. The options contain the Docker `executable` and an `AbortSignal`. The optional `run` command port supports isolated fixtures.

Both operations require an offline target. They hold the home, supervisor, and dispatch locks until the command and receipt work finish. They reject a retained supervisor process record, any container that references either volume, or an unsettled dispatch permit. The dispatch block remains closed.

The installer reads the paired journal and copied snapshot. It checks the raw manifest, capture receipt, source home, source host, compatibility, and file hashes. It requires the qualified package to match the captured package. Docker must already contain the exact image config digest.

A restricted Python helper copies the files with exclusive creation. It writes `/data/config/langflow.db` with mode `0600` and `/run/trellis-secrets/engine-secret` with mode `0400`. Both files belong to UID and GID `10001`. The helper starts with the qualified local image, no network, a read-only root, and an explicit Python entrypoint. It does not start Langflow.

The external receipt store retains the exact install intent before volume creation. The volume marker retains those bytes only after both files pass validation. An equal replay reads the existing files. A partial copy, foreign volume, changed bytes, or changed modes refuses the operation. The installer never replaces an existing database or secret.

The result is serializable: `{receiptId, sourceBytes, sourceDigest, record}`. The record binds the target identity and block to the source capture, qualified package, volume names, hashes, sizes, owners, modes, and SQLite schema. The helper checks SQLite integrity and the captured Alembic heads. A separate read-only helper verifies the destination before the receipt is saved.

This receipt proves an offline copy. The future startup caller must verify it before secret provisioning and retain the exact volume association. Live reconciliation must compare the actual engine identity under its engine lease. Workspace and provider destination checks still apply. Neither operation releases the gate.

The authored fixtures exercise the copy helper on temporary files and the host locks. They do not prove OCI compatibility. Tests, types, lint, Review, containers, actual installation, and activation remain deferred for the selected batch.
