# Offline restore exclusion

`withIsolatedRestore({home, hostId, dataHomeId, block}, operation)` holds the home, supervisor, and dispatch locks in that order. The callback receives `{identity, privateRoot, assertClosed}`. The public `langflowHost` barrel exports the function and its input and scope types.

The current identity and restore block must match the input. All permits must have terminal receipts. All capture grants must be revoked. Any supervisor process record prevents entry. The scope holds its locks through the awaited callback and a final `assertClosed`. This assertion validates the actual HomeLock handles before it reads the current state. An escaped assertion fails after the scope releases its locks.

The engine installer adds its own receipt objects inside this scope. A native installer acquires retention and sorted attempt locks inside the callback, outside database transactions. A running host verifier uses its existing exclusion; this offline scope requires exclusive ownership of the target home.

The scope does not release the dispatch block. File readback, retained receipts, native process ownership, workspace state, and provider state keep their separate verification requirements.
