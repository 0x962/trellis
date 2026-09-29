# Catalog batch fixtures

TRL-667 runs these fixtures in the existing pinned environment after source merge.
The batch needs the matched backend patches for the external-wait definition.
No fixture installs a dependency, starts a server, or calls a provider.

```sh
PYTHONDONTWRITEBYTECODE=1 "$LANGFLOW_PYTHON" -m pytest -q \
  -c "$LANGFLOW_SOURCE_ROOT/pyproject.toml" \
  --basetemp "$LANGFLOW_RUN_ROOT/trellis-catalog-pytest" \
  "$TRELLIS_ROOT/integrations/langflow/tests/catalog"
```

The caller supplies `TRELLIS_ROOT`, `LANGFLOW_SOURCE_ROOT`, `LANGFLOW_PYTHON`, and `LANGFLOW_RUN_ROOT`.
The run root must exist and belong to this batch.
The fixtures export `catalog-frontend-templates.json` under that root.
The export contains actual engine templates, including the complete component code.
It contains synthetic configuration only.

The graph cases exercise the actual Langflow graph and both new component classes.
They check branch exclusion, original result identity, source order, empty text, and retained output references.
The other cases refuse ambiguous answers, incomplete results, missing children, and source digest changes.
The archive case checks source verification without Git metadata.

These fixtures do not launch a native agent, create a human request, invoke Jev, or qualify a group or loop conversion.
The converter owner retains the complete source-field round trip and private Review v71 proof.
A passing data-component trace does not clear a legacy mapping blocker.
