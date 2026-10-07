# Setup browser proof harness

This harness builds the mobile Expo Web fixture and captures the setup and pairing matrix on Boxd.

Run it from any directory:

```sh
reports/native-mobile-setup-final/harness/run.sh \
  /home/boxd/worktrees/trl-1497 \
  /home/boxd/worktrees/trl-1420/reports/native-mobile-setup-final \
  5ac852d194a9521797859c5103b7ea14eaccb409
```

The first argument is a clean product worktree. The third argument must equal its `HEAD`.

The harness uses Bun 1.3.13, React Native Web 0.21.2, Expo Metro Runtime 57.0.15, Playwright 1.63.0, and axe-core 4.13.0. It keeps product source and lock files unchanged. It uses synthetic health, ticket count, actor, event stream, camera, and browser storage data. It reads no credential and contacts no live server. The camera shim supplies only the declared permission and barcode fixture. Each browser context owns its temporary storage.

The runner writes screenshots, `results.json`, `index.html`, and `manifest.sha256` to the artifact directory. It stops its server and removes its temporary run directory before it exits.

The output proves Expo Web behavior. It does not prove Android or iOS behavior.

## Resolved harness failures

These failures came from the proof harness. They did not show a product defect.

- Metro initially rejected the shims outside the product root. The fixture adds its directory to Metro watch folders.
- Expected connection-refused cases produced browser network errors. The fixture accepts those errors only in scenarios that require a network failure.
- A browser context sometimes stalled during per-case shutdown. The fixture now uses one browser with an isolated context for each case.
- The stored old server opened an unmocked event stream. The fixture now serves both synthetic server event routes.
- The storage seed ran again after reload and erased the saved values. The fixture seeds storage once for each browser context.
- The reload check searched text nodes for input values. The fixture now checks the exact input values and uses labels for visible recovery.
- A generic blur retained Chromium's prior tab position. The fixture now names and checks the tab order from Server URL.
- One remote command transport ended during capture. Detached runs keep a remote log and an explicit exit receipt.

To isolate one case without replacing the artifact, set `TRL1420_CASE`:

```sh
TRL1420_CASE=saved-reload-retention \
  reports/native-mobile-setup-final/harness/run.sh \
  /home/boxd/worktrees/trl-1497 \
  /home/boxd/worktrees/trl-1420/reports/native-mobile-setup-final \
  5ac852d194a9521797859c5103b7ea14eaccb409
```

The runner caches the Expo Web export by the product source and shim hashes. An isolated retry reuses the exact export. Cache cleanup keeps the current export and the two newest prior exports.

Run the three harness negative controls before a complete matrix:

```sh
reports/native-mobile-setup-final/harness/negative-controls.sh \
  /home/boxd/worktrees/trl-1497 \
  /home/boxd/worktrees/trl-1420/reports/native-mobile-setup-final \
  5ac852d194a9521797859c5103b7ea14eaccb409
```
