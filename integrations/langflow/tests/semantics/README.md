# Semantics probe

These fixtures run against the pinned Langflow source. They use deterministic components and no provider credentials.

The standalone probe covers these cases:

- the patched `langflow` and `lfx` import paths;
- the distinct human wait and engine request identities from TRL-666;
- one real graph suspension, restored human result, and successor execution;
- a kill after resume selection and before the next graph checkpoint;
- two concurrent completion obligations with one queue claim;
- a fresh foreign lease that keeps both human and admission obligations pending;
- a crash after executor submission and before the runner claim;
- a one-shot lease-expiry retry without another boot or submission;
- equal duplicate completion bytes and one immutable receipt;
- checkpoint round trips at and above the dense fixture sizes;
- deadline arithmetic from the observed launch time.

The standalone probe does not prove the complete ticket acceptance. The combined TRL-674 series must still prove these cases:

- the exact Review v71 trace, instructions, harness settings, and outputs;
- synthetic joins, NO branches, skips, failed-child propagation, groups, and nested loops;
- stale, forged, changed, delayed, and out-of-order completion deliveries;
- every checkpoint kill window for independent concurrent waits;
- original launch deadlines through real group execution;
- the composed TRL-668 admission transaction and TRL-670 retained decision lookup;
- the exact dispatch proof and cancellation outcomes after the complete patch set merges.

The fixture imports `langflow` and `lfx` from `LANGFLOW_SOURCE_ROOT`. TRL-667 checks those paths before the probe starts.

Run this command after Root merges the complete Langflow source set:

```sh
python -m pytest -q -c "$LANGFLOW_SOURCE_ROOT/pyproject.toml" "$TRELLIS_ROOT/integrations/langflow/tests/semantics"
```

The command requires these variables:

- `TRELLIS_ROOT`: the Trellis worktree with the final TRL-666 source;
- `LANGFLOW_SOURCE_ROOT`: the pinned Langflow source root;
- `LANGFLOW_RUN_ROOT`: the private fixture directory.

The fixture does not install dependencies or start a server.
No fixture, build, engine probe, or Review flow ran for this source publication.
