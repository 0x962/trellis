# Executable group scopes

This fragment targets Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.
It adds group scope state to the existing graph checkpoint.
It also records conditionally skipped children before a group join becomes runnable.

The component interface has three nodes:

- `TrellisGroupScopeV1` receives `boundary_inputs` and `scope_definition`.
- `TrellisGroupSettlementV1` receives `result` and `source_node_id`.
- `TrellisGroupOutputV1` receives `scope_entry` and `settlements`.

The boundary emits `entries`.
The child adapter emits `settlement`.
The join emits `out`.

The scope component calls `capture_visit_scope` from its actual engine vertex.
It calls `allocate_control_visit` with the immutable `scope_definition.groupNodeId`.
It reads the optional loop visit key from `loop_body_visit_key`.
That helper compares the saved group definition with the archived node ID for the active loop.
It returns a commit target only for the loop's published body scope.
It then calls `graph.activate_group_occurrence` before it opens the group scope.
The boundary allocation retains the incoming consumer scope.
The activation supplies the full saved occurrence, loop visit key, and a child scope with that occurrence as its parent.
The child scope phase is `children`.
The group control stores those records without a JSON encode or decode step.
The component inputs contain no runtime identity.
For a timed group, the scope component sends only the saved binding, scope vertex, and occurrence key to the host callback.
The host reads this fragment's durable proof endpoint and returns the current deadline record and ordered references.

The graph exports these runtime readers:

```python
graph.activate_group_occurrence(scope_vertex_id: str, occurrence: dict, loop_visit_key: str | None, scope: dict) -> dict
graph.current_group_occurrence(vertex_id: str) -> str
graph.group_visit_scope(group_occurrence_key: str, vertex_id: str) -> dict
graph.group_scope_visit(group_occurrence_key: str) -> dict
graph.group_scope_output(group_occurrence_key: str) -> dict
graph.group_scope_deadlines(group_occurrence_key: str) -> tuple[tuple[str, ...], str | None]
```

`create_group_scope_router` adds `POST /trellis-v1/group-scopes/read` beneath the authenticated engine API.
Its strict input has `executionId`, `publicationId`, `engineJobId`, `engineEpoch`, `scopeVertexId`, and `occurrenceKey`.
It reads the durable control journal, entered graph checkpoint, and immutable publication in one transaction.
It returns the exact binding, scope vertex, saved occurrence, saved scope, and group definition.
The reader verifies the control key, publication definition hash, component type, source group ID, and admission binding.
It also verifies the entered definition, group occurrence, child parent, `children` phase, iteration path, inputs, and deadline ancestry.

The occurrence producer passes `graph.group_visit_scope(group_occurrence_key, vertex_id)` to `run_native_visit` or `run_human_visit`.
It derives input receipts from committed edge receipts.
It does not read runtime identity from the static scope definition.
The scope boundary and output call `record_control_output` before they return.
The boundary output joins exact saved input strings in engine edge order.
The group output passes `outputBytes` as the exact public output string.

The group output has `groupOccurrenceKey`, `outputBytes`, and `children`.
Each child has `nodeId`, `occurrenceKey`, `state`, `outputBytes`, and `receiptId`.
The child order equals the immutable source node order.
The output joins each non-skipped child with exactly `\n\n`.
Each `childVertices` record names separate input and output vertices.
It also names the one common result producer used for settlement.
An ordinary child uses one vertex for both fields.
A nested group uses its scope vertex for input and its join vertex for output.
A loop child declares `scope_entry` as its scope input and `seed` as its value input.
An entry loop receives the group control value through `scope_entry` only.
The occurrence reader excludes that activation-only edge from selected predecessor receipts.
A connected loop receives its predecessor value through `seed`.
Branch routing uses the child binding's `outputPorts` map.
A gate routes through its `yes` and `no` ports and settles from its common committed result producer.
The scope `entries` port connects to the output `scope_entry` port, so an empty group opens before it completes.

When the group is the exact loop body, the join calls `graph.commit_trellis_loop_children(loopVisitKey, output)`.
A nested group completes with no loop commit target.
TRL-984 supplies that checkpoint interface and the later condition phase.

Apply this fragment after the external-wait and occurrence-request fragments.
Apply the TRL-984 loop fragment before component execution.
The assembly owner must compose the shared graph and checkpoint hunks against the current patch series.
The startup owner must add `create_group_scope_router` to the shared engine router.
The startup owner must call `install_group_deadline_transport` with the private host origin and authentication file.

The component catalog still needs three definitions and their exported frontend templates.
The converter still needs to bind each source association to an immutable node specification.
This fragment adds no migration and no runtime registration.
The host callback requires the TRL-1030 source and its private route registration.

Run the fixtures after the complete source batch merges:

```sh
pytest integrations/langflow/tests/groupScopes integrations/langflow/patches/groupScopes/tests
```
