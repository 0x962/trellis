# Group scope components

`TrellisGroupScopeV1` accepts `boundary_inputs` and the static `scope_definition`.
It reads the actual input receipts with `capture_visit_scope`.
It allocates the saved occurrence with `allocate_control_visit` and `scope_definition.groupNodeId`.
It reads the optional loop visit key from `graph.trellis_current_loop_policy()`.
It activates the occurrence before it opens the group scope.
It sends the boundary values to each entry through the `entries` port.

The graph activation stores the full occurrence, optional loop visit key, and exact `VisitScope.from_engine` fields:

- `parentOccurrenceKey` identifies its persisted parent visit or is null.
- `phase` equals `children` for group body work.
- `iterationPath` lists `{loopNodeId, round}` from the outer loop to the inner loop.
- `inputReceiptIds` lists committed input receipts in actual edge order.
- `groupDeadlineRefs` lists deadline IDs from the outer timed group to the inner timed group.
- `deadlineAt` is the effective ISO timestamp or null.

Loop feedback stays in `graph.read_trellis_loop_visit(loopVisitKey)`.

`TrellisGroupSettlementV1` accepts `result` and `source_node_id`.
It emits `settlement` with the source node, child occurrence, state, exact output bytes, and `receiptId`.

`TrellisGroupOutputV1` accepts the `settlements` list.
It emits `out` after every source child has a completed, failed, or skipped settlement.
The output joins non-skipped bytes in source node order with exactly two newline characters.
For a loop body, it calls `graph.commit_trellis_loop_children(loopVisitKey, output)` after the group output is complete.

`expand_group_scope(group, nodes, edges)` creates the boundary, settlement, and output nodes.
It returns actual ports, edges, and stable source associations.
A child binding supplies `inputVertexId`, `outputVertexId`, `engineNodes`, `sourceAssociations`, and its port names.
A nested group uses its scope vertex for input and its join vertex for output.
A parallel group connects every child to the boundary.
A connected group keeps each explicit source edge and connects only its entry nodes to the boundary.

The components preserve deadline IDs and effective timestamps.
They do not create deadline records or start clocks.
The native launch transaction owns those operations.
Timed scope entry fails with `group_deadline_reservation_required` until the authenticated reserve operation is available.

The scope boundary and group output call `record_control_output` before they return.
The boundary receipt joins the exact saved input output strings in engine edge order.
The group output receipt stores the joined `outputBytes` without another serialization.
Their public values carry the saved output bytes and receipt ID.
Child controls read the current group occurrence from saved graph state by their actual engine vertex ID.
