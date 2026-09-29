# Executable group scopes

This fragment targets Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.
It adds group scope state to the existing graph checkpoint.
It also records conditionally skipped children before a group join becomes runnable.

The component interface has three nodes:

- `TrellisGroupScopeV1` receives `group_occurrence`, `scope_context`, `boundary_inputs`, and `scope_definition`.
- `TrellisGroupSettlementV1` receives `scope_context`, `result`, and `source_node_id`.
- `TrellisGroupOutputV1` receives `scope_context` and `settlements`.

The boundary emits `entries`.
The child adapter emits `settlement`.
The join emits `out`.

`group_occurrence` carries `occurrenceKey` and optional `loopVisitKey` from the persisted engine visit.
`scope_context` carries the exact TRL-886 `VisitScope.from_engine` value.
The group control stores that value without a JSON encode or decode step.

The graph exports these runtime readers:

```python
graph.group_visit_scope(group_occurrence_key: str, vertex_id: str) -> dict
graph.group_scope_output(group_occurrence_key: str) -> dict
graph.group_scope_deadlines(group_occurrence_key: str) -> tuple[tuple[str, ...], str | None]
```

The occurrence producer passes `graph.group_visit_scope(group_occurrence_key, vertex_id)` to `run_native_visit` or `run_human_visit`.
It derives input receipts from committed edge receipts.
It does not read runtime identity from the static scope definition.

The group output has `groupOccurrenceKey`, `outputBytes`, and `children`.
Each child has `nodeId`, `occurrenceKey`, `state`, `outputBytes`, and `receiptId`.
The child order equals the immutable source node order.
The output joins each non-skipped child with exactly `\n\n`.

When `loopVisitKey` exists, the join calls `graph.commit_trellis_loop_children(loopVisitKey, output)`.
TRL-984 supplies that checkpoint interface and the later condition phase.

Apply this fragment after the external-wait and occurrence-request fragments.
Apply the TRL-984 loop fragment before component execution.
The assembly owner must compose the shared graph and checkpoint hunks against the current patch series.

The component catalog still needs three definitions and their exported frontend templates.
The converter still needs to bind each source association to an immutable node specification.
This fragment adds no migration and no runtime registration.

Run the fixtures after the complete source batch merges:

```sh
pytest integrations/langflow/tests/groupScopes integrations/langflow/patches/groupScopes/tests
```
