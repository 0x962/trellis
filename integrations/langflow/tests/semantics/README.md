# Semantics probe

These fixtures run against the pinned Langflow source. They use deterministic components and no provider credentials.

The standalone fixtures define these cases:

- the patched `langflow` and `lfx` import paths;
- the distinct human wait and engine request identities from TRL-666;
- one real graph suspension, restored human result, and successor execution;
- a kill after resume selection and before the next graph checkpoint;
- two concurrent completion obligations with one queue claim;
- a fresh foreign lease that keeps both human and admission obligations pending;
- a crash after executor submission and before the runner claim;
- a one-shot lease-expiry retry without another boot or submission;
- equal duplicate completion bytes and one immutable receipt;
- full native result, attempt, job, receipt, and current authority bindings;
- delayed and out-of-order completion storage with independent receipts;
- the exact Review v71 manifest, instructions, harness settings, decisions, and output bytes;
- Review v71 branch exclusion and ordered group output through a real Langflow graph;
- nested stock Langflow loops;
- controlled launch deadlines and the half-time and quarter-time warning points;
- checkpoint round trips at and above the dense fixture sizes;
- deadline arithmetic from the observed launch time.

The standalone fixtures do not prove the complete ticket acceptance. The combined TRL-674 series must still prove these cases:

- failed-child propagation through the proposed Review adapter;
- the complete kill matrix around every checkpoint for two independent waits;
- current authority lookup from the durable correlation row before completion storage;
- deadline timer recovery and worker stops after a process restart;
- public occurrence keys and iteration paths for every nested-loop round;
- the composed TRL-668 admission transaction and TRL-670 retained decision lookup;
- the exact dispatch proof and cancellation outcomes after the complete patch set merges.

The fixture imports `langflow` and `lfx` from `LANGFLOW_SOURCE_ROOT`. TRL-667 checks those paths before the probe starts.

Run this command after Root merges the complete Langflow source set:

```sh
trellis flow run show 01M3Q28YH0GYVVHM434T3WVGMH --json > "$LANGFLOW_RUN_ROOT/review-v71.json"
export TRELLIS_REVIEW_V71_RUN="$LANGFLOW_RUN_ROOT/review-v71.json"
python -m pytest -q -c "$LANGFLOW_SOURCE_ROOT/pyproject.toml" "$TRELLIS_ROOT/integrations/langflow/tests/semantics"
```

The command requires these variables:

- `TRELLIS_ROOT`: the Trellis worktree with the final TRL-666 source;
- `LANGFLOW_SOURCE_ROOT`: the pinned Langflow source root;
- `LANGFLOW_RUN_ROOT`: the private fixture directory.
- `TRELLIS_REVIEW_V71_RUN`: the private full Review v71 run record.

The fixture does not install dependencies or start a server.
No fixture, build, engine probe, or Review flow ran for this source publication.
