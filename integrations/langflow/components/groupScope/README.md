# Group scope components

`TrellisGroupScopeV1` accepts `boundary_inputs` and the static `scope_definition`.
It reads the actual input receipts with `capture_visit_scope`.
It allocates the saved occurrence with `allocate_control_visit` and `scope_definition.groupNodeId`.
It reads the optional loop visit key from `graph.trellis_current_loop_policy()`.
It allocates the group occurrence from the boundary consumer scope.
It sets the child scope parent to that group occurrence and sets its phase to `children`.
It activates the child scope before it opens the group scope.
It sends the boundary values to each entry through the `entries` port.

The graph activation stores the full occurrence, optional loop visit key, and exact child `VisitScope.from_engine` fields:

- `parentOccurrenceKey` identifies the saved group occurrence.
- `phase` equals `children` for group body work.
- `iterationPath` lists `{loopNodeId, round}` from the outer loop to the inner loop.
- `inputReceiptIds` lists committed input receipts in actual edge order.
- `groupDeadlineRefs` lists deadline IDs from the outer timed group to the inner timed group.
- `deadlineAt` is the effective ISO timestamp or null.

Loop feedback stays in `graph.read_trellis_loop_visit(loopVisitKey)`.

`TrellisGroupSettlementV1` accepts `result` and `source_node_id`.
It emits `settlement` with the source node, child occurrence, state, exact output bytes, and `receiptId`.

`TrellisGroupOutputV1` accepts `scope_entry` and the `settlements` list.
The `scope_entry` input orders an empty group after the saved scope entry.
It emits `out` after every source child has a completed, failed, or skipped settlement.
The output joins non-skipped bytes in source node order with exactly two newline characters.
For a loop body, it calls `graph.commit_trellis_loop_children(loopVisitKey, output)` after the group output is complete.

`expand_group_scope(group, nodes, edges)` creates the boundary, settlement, and output nodes.
It returns actual ports, edges, and stable source associations.
A child binding supplies `inputVertexId`, `outputVertexId`, `outputPorts`, `settlementSourceVertexId`, `settlementOutputPort`, `scopeInputPort`, `inputPort`, `engineNodes`, and `sourceAssociations`.
A source edge selects `outputPorts[branch]`, where an absent branch uses `out`.
A gate uses its decision vertex and `yes` and `no` output ports for routing.
A gate uses its common committed result producer as its settlement source.
One singular settlement input observes that result before either branch continues.
A nested group uses its scope vertex for input and its join vertex for output.
A loop child uses `scopeInputPort=scope_entry` and `inputPort=seed`.
When the loop is a group entry, `entries` connects only to `scope_entry`.
The loop does not treat `scope_entry` as a selected input.
A connected loop receives its predecessor value through `seed`.
A parallel group connects every child to the boundary.
A connected group keeps each explicit source edge and connects only its entry nodes to the boundary.

The scope component reserves a timed group through the authenticated host callback.
The host derives the budget from the immutable publication and returns the complete ordered deadline references.
The component persists the entered group before it calls the host.
The engine reader verifies the original allocation and the entered child scope.
The first native launch transaction starts an unstarted clock.

The scope boundary and group output call `record_control_output` before they return.
The boundary receipt joins the exact saved input output strings in engine edge order.
The group output receipt stores the joined `outputBytes` without another serialization.
Their public values carry the saved output bytes and receipt ID.
Child controls read the current group occurrence from saved graph state by their actual engine vertex ID.
