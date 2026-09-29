# Correlation fixture

This fixture applies to Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.

Apply `integrations/langflow/patches/correlation/0001-permanent-correlation-and-admission.patch` to the pinned source.
Run this command from the Trellis repository root through the environment owner:

```sh
PYTHONPATH="$LANGFLOW_SOURCE/src/backend/base:$LANGFLOW_SOURCE/src/lfx/src" \
  "$LANGFLOW_PYTHON" -m pytest -q \
  integrations/langflow/tests/correlation/test_permanent_correlation_and_admission.py
```

The fixture reads the final TRL-666 JSON examples from `apps/server/src/langflowContracts/fixtures`.
The serial window must run `assertPinnedImports.py` first to prove that Python loads the patched source.
The fake store tests exact-byte identity and the barrier interface.
It does not prove database transactions, a saved graph checkpoint, worker release, recovery, or installed behavior.
The serial real-engine probe must supply that proof before TRL-668 can pass.
