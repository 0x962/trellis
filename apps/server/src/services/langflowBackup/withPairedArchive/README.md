# Paired archive input

`withPairedArchive({liveHome}, {archive, signal}, consume)` reads an absolute archive path without following a final symlink.
It creates a private temporary directory outside the live home and its authority directory.
The callback receives `{directory, manifest, manifestBytes, manifestDigest}` after `readSnapshot` verifies the extracted inventory.
`manifestBytes` retains the original UTF-8 string. The digest covers the original file bytes.

The staging directory exists through the complete callback promise.
The operation removes only its temporary directory after callback completion, failure, or abort.
The source archive remains unchanged.
The callback must finish all source reads before it returns.

`restorePairedArchive(ctx, input)` calls `restorePairedSnapshot` inside this scope.
Its input supplies the archive, new destination envelope, new target home, request ID, compatibility, and signal.
It returns the existing isolated restore result with the external dispatch block still closed.
The copied payload retains the original manifest bytes and unavailable-history records.
Host composition owns the CLI and startup routes.

The streaming reader accepts USTAR headers, GNU long paths, and per-entry PAX path, size, ownership, and time fields.
It refuses unknown extensions, duplicate entries, links, devices, path escapes, unexpected roots, invalid checksums, and incomplete streams.
It creates only private directories and regular files, and preserves executable bits.
The manifest inventory verifies every payload file after extraction.
Archive verification grants no runtime, host, or dispatch authority.

The authored fixtures cover real archive output, isolated restore, exact manifest bytes, long paths, unavailable history, consumer failure, abort, and malformed entries.
Execution, destination installation, live association, and complete restore acceptance remain unverified.
