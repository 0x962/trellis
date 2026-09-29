# Correlation fixture

This fixture applies to Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.

The integration owner assembles immutable TRL-668, TRL-669, and TRL-670 source snapshots.
The assembly regenerates each shared `JobService` and background service hunk from the clean pin.
Regenerate the overlapping shared-file hunks instead of applying them in sequence.
Run the pure fixture from the Trellis repository root:

```sh
TRELLIS_ROOT="$PWD" \
  PYTHONPATH="$LANGFLOW_SOURCE/src/backend/base:$LANGFLOW_SOURCE/src/lfx/src" \
  "$LANGFLOW_PYTHON" -m pytest -q \
  integrations/langflow/tests/correlation/test_permanent_correlation_and_admission.py
```

Run the composed fixtures after the complete Langflow source merge:

```sh
test -n "$TRL668_RUN_ROOT" && \
  mkdir -p "$TRL668_RUN_ROOT/home" "$TRL668_RUN_ROOT/tmp" "$TRL668_RUN_ROOT/config" && \
  cd "$LANGFLOW_SOURCE" && \
  HOME="$TRL668_RUN_ROOT/home" \
  TMPDIR="$TRL668_RUN_ROOT/tmp" \
  LANGFLOW_CONFIG_DIR="$TRL668_RUN_ROOT/config" \
  LANGFLOW_TEST_DATABASE_URI= \
  TRELLIS_ROOT="/Users/navidkhan/.trellis/agents/01M3NYHH7VWE3QKE0JNHEDA0ZQ/work" \
  LANGFLOW_SOURCE_ROOT="$LANGFLOW_SOURCE" \
  PYTHONDONTWRITEBYTECODE=1 \
  PYTHONPATH="$LANGFLOW_SOURCE/src/backend:$LANGFLOW_SOURCE/src/backend/base:$LANGFLOW_SOURCE/src/lfx/src" \
  "$LANGFLOW_PYTHON" -m pytest -q -c "$LANGFLOW_SOURCE/pyproject.toml" \
  -p tests.conftest \
  "$TRELLIS_ROOT/integrations/langflow/tests/correlation/test_real_transaction_correlation.py" \
  "$TRELLIS_ROOT/integrations/langflow/tests/correlation/test_failure_boundary_correlation.py"
```

The fixtures read the final TRL-666 JSON examples from commit `6246fcca805f6e5390f26b7924e28f27f7de0409`.
The integrated run must prove that each patched import resolves inside the pinned Langflow source.
The fake store tests exact-byte identity and the barrier interface.
The composed fixture tests one database correlation, response-loss recovery, terminal lookup, a saved graph wait, and worker suspension.
It commits admission with the same transaction as the resume signal and queue claim.
It retains the admission dispatch obligation until the common queue path proves dispatch or prior execution.
The crash fixture kills the engine and fake-native services before and after each admission transaction and before acknowledgements.
The resumed service clears the wait and records one native effect.
It sets no engine deadline.
It does not prove a production migration or installed behavior.
Integrated verification remains required before TRL-668 can pass.
