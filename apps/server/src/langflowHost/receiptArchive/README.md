# Durable receipt archive

`DispatchReceiptArchive.open(control)` opens `receipts` in the external directory of `LangflowHostControl`.
Each record retains its exact permit or block, the validation source bytes, and their SHA256 digest.
The archive writes private files, syncs them, and links each immutable record under its content digest.
Reads check the stored digest and schema before they return a receipt.

`writeTerminal({permit, outcome, sourceBytes, sourceDigest})` returns a durable `TerminalReceipt`.
The trusted caller must first read a committed immutable action or engine receipt and validate the exact permit binding.
For local mutations, that receipt must include the request bytes, result, and committed projection revision.
A successful function return cannot replace that query.
`readTerminal(permit, receiptId)` reads the retained evidence after a restart.
`gate.settle` then records the exact receipt against the pending permit.

`writeReconciliation({block, packageDigest, sources})` retains each source in one immutable record.
The sources cover the Trellis database, engine database, secret version, current ownership, native attempts, stops, and optional snapshot seal.
Each source has `sourceBytes` and `sourceDigest`.
The stop source uses `readStopReconciliation` from `langflowStops`.
The archive checks its target home, block, generation, and every stop state, including canceled executions.
The native source uses `readNativeSnapshotManifest` and must report ready with no unavailable entries.
Native file content and secret values must stay out of these evidence records.
The snapshot service separately copies the private files into its private export roots.

`readReconciliation(block, receiptId)` returns the exact retained reconciliation receipt while that block is current.
The archive does not establish whether an old observation remains current.
The trusted `withReconciliation` adapter must query the live sources under shared exclusion before it writes and commits this receipt.
That exclusion must cover ownership changes, database state, native observations, and the stop set.
The adapter must compare the restored package, both stores, and secret version with the selected snapshot.
It must retain the block if any source is missing, stale, unknown, or incompatible.
Neither archive write releases dispatch; only `gate.reconcile` can do so.
