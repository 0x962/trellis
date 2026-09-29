# Group scope components

`TrellisGroupScopeV1` opens one group occurrence from `group_occurrence`, `scope_context`, and `scope_definition`.
It sends the same context and boundary inputs to each entry through the `entries` port.

`group_occurrence` has `occurrenceKey` and an optional `loopVisitKey`.
The occurrence key comes from the persisted engine visit.

`scope_context` has the exact `VisitScope.from_engine` fields from TRL-886:

- `parentOccurrenceKey` identifies its persisted parent visit or is null.
- `phase` equals `children` for group body work.
- `iterationPath` lists `{loopNodeId, round}` from the outer loop to the inner loop.
- `inputReceiptIds` lists committed input receipts in actual edge order.
- `groupDeadlineRefs` lists deadline IDs from the outer timed group to the inner timed group.
- `deadlineAt` is the effective ISO timestamp or null.

Loop feedback stays in `graph.read_trellis_loop_visit(loopVisitKey)`.
It does not enter `scope_context`.

`TrellisGroupSettlementV1` accepts `scope_context`, `result`, and `source_node_id`.
It emits `settlement` with the source node, child occurrence, state, exact output bytes, and `receiptId`.

`TrellisGroupOutputV1` accepts `scope_context` and the `settlements` list.
It emits `out` after every source child has a completed, failed, or skipped settlement.
The output joins non-skipped bytes in source node order with exactly two newline characters.
For a loop body, it calls `graph.commit_trellis_loop_children(loopVisitKey, output)` after the group output is complete.

`expand_group_scope(group, nodes, edges)` creates the boundary, settlement, and output nodes.
It returns actual ports, edges, and stable source associations.
A child binding supplies `engineNodeId`, `engineNode`, `inputPort`, `outputPort`, and `scopeInputPort`.
A parallel group connects every child to the boundary.
A connected group keeps each explicit source edge and connects only its entry nodes to the boundary.

The components preserve deadline IDs and effective timestamps.
They do not create deadline records or start clocks.
The native launch transaction owns those operations.
