# Catalog batch fixtures

TRL-667 runs these fixtures in the existing pinned environment after source merge.
The batch needs the matched backend patches for the external-wait definition.
The native request fixture uses one local HTTP server with synthetic responses.
It closes the server and its thread after each case.
No fixture installs a dependency or calls a provider.

```sh
PYTHONDONTWRITEBYTECODE=1 "$LANGFLOW_PYTHON" -m pytest -q \
  -c "$LANGFLOW_SOURCE_ROOT/pyproject.toml" \
  --basetemp "$LANGFLOW_RUN_ROOT/trellis-catalog-pytest" \
  "$TRELLIS_ROOT/integrations/langflow/tests/catalog"
```

The caller supplies `TRELLIS_ROOT`, `LANGFLOW_SOURCE_ROOT`, `LANGFLOW_PYTHON`, `LANGFLOW_RUN_ROOT`, and `LANGFLOW_OVERLAY_SHA256`.
The run root must exist and belong to this batch.
`LANGFLOW_OVERLAY_SHA256` identifies the verified applied patch series.
`CATALOG_MANIFEST_SHA256` comes from the reviewed source handoff or verified package.
Do not derive an expected digest from unverified files.

TRL-667 supplies the existing CPython 3.12.12 executable and the matched engine roots.
The exact merged Trellis snapshot must include every source that the catalog names.
Set the import paths before either deferred command:

```sh
export PYTHONPATH="$TRELLIS_ROOT:$LANGFLOW_SOURCE_ROOT/src/backend:$LANGFLOW_SOURCE_ROOT/src/backend/base:$LANGFLOW_SOURCE_ROOT/src/lfx/src"
```

After the capacity hold ends, run the public exporter in that matched environment:

```sh
PYTHONDONTWRITEBYTECODE=1 "$LANGFLOW_PYTHON" -m integrations.langflow.components.catalog.exportTemplates \
  --trellis-root "$TRELLIS_ROOT" \
  --engine-root "$LANGFLOW_SOURCE_ROOT" \
  --manifest-sha256 "$CATALOG_MANIFEST_SHA256" \
  --engine-commit fec71dca901949c09ed4d63315804337cd2eb13d \
  --engine-overlay-sha256 "$LANGFLOW_OVERLAY_SHA256" \
  --output "$LANGFLOW_RUN_ROOT/frontend-templates.v1.json"
```

The export retains real engine templates, including the full component code and defaults.
The final package must seal these bytes before an installed consumer uses them.
The template fixtures compare every full engine result and retain each publication blocker.
They reject a different import path, substituted code, an output overwrite, and aliases into source roots.

The graph cases exercise the actual Langflow graph and the catalog component classes.
They check branch exclusion, original result identity, source order, empty text, and retained output references.
The other cases refuse ambiguous answers, incomplete results, missing children, and source digest changes.
The archive case checks source verification without Git metadata.
The HTTP cases check exact request/response bytes, explicit credentials, proxy isolation, and one request after errors.
They prove the client boundary only; the server handler is synthetic.
The native completion case uses a private SQLite database and the actual engine migrations.
It suspends a real graph, stores the synthetic completion through the public broker, and resumes the graph.
It checks the exact saved result and cleared wait.
The database lives under the batch pytest directory.

These fixtures do not launch a native agent, create a human request, invoke Jev, or qualify a group or loop conversion.
The converter owner retains the complete source-field round trip and private Review v71 proof.
A passing data-component trace does not clear a legacy mapping blocker.
