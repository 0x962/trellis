# Restored database association

`installRestoredDatabase({ home, signal })` requires an existing external restore block and an absent `home/db` directory. It validates the sealed payload, copies `trellis/db`, and compares the complete destination inventory. The immutable receipt remains outside the target home. A partial copy leaves the block closed and prevents another install into that directory.

`withRestoredDatabaseOpen({ home, dataDir, installReceiptId, bootId }, operation)` validates the installed bytes before `operation` opens the database. The external restore lock remains held through the callback and receipt publication. Both the worker and inline startup must enter this function before `initCluster` or `openDb`.

The callback receives `VerifiedRestoredDatabase`. It returns `{ value, receipt }`, where `value.close()` closes the actual database. The callback produces migration and retained execution facts from that opened database. Each source has its exact UTF-8 bytes and SHA256. The host checks the boot, directory, source digests, identity, and current restore block before it archives the receipt.

The callback owns cleanup if it fails before it returns. If receipt validation fails after the callback returns, the host closes `value`. The return value includes `receiptId`, `sourceBytes`, and `sourceDigest` for the immutable open receipt.

`readRestoredDatabaseOpen({ home, bootId, receiptId })` checks the saved receipt against the current identity and exact restore block. Reconciliation must compare its retained facts with current database queries under a held transaction. Reconciliation must also hold the external `restored-database` lock through release of the gate.

This module installs only the Trellis database. Engine files, attachments, Pages, native files, workspaces, and conversations require their own verified install and exclusion. An open receipt preserves the association at database startup; it does not prove a later database state. An interrupted open can change files before receipt publication. Such files fail the next byte comparison and keep dispatch blocked.

The six source fixtures cover an exact install, changed bytes, invalid receipt digests, concurrent opens, boot mismatch, and unsafe source files. Their execution remains deferred with the integrated batch.
