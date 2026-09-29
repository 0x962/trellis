# Trellis loop control

The patch adds durable loop visits to the Langflow graph checkpoint. Langflow graph edges select each child phase and condition phase.

The loop component calls `capture_visit_scope` before `begin_trellis_loop_visit`. It passes the captured per-vertex scope as `inherited_scope`. The graph context does not select a root visit. `begin_trellis_loop_visit` creates one restart-stable visit from the loop node, parent occurrence, and inherited iteration path. It accepts the positive `maxRounds` from the sealed component definition. The condition producer reads the immutable harness and prompt from the published graph document.

The `scope_entry` and `seed` ports are optional. A root loop omits both ports. The visit saves `selectedInputs` as an empty list and `childInputBytes` as an empty string. It creates no predecessor output or receipt. A nested group connects its `entries` output to `scope_entry` before the loop captures its visit scope. The loop does not use that control value as a selected input. A connected loop receives the actual predecessor `Data` through `seed` and retains its exact data and text.

The compiler uses the source loop ID as `loopNodeId`. It expands `children` through one ordered group scope, then sends the group output to the native condition. A `NO` result returns to `children`, and `done` releases the original successors. The generated condition association uses phase `condition`, definition `native-agent-v1`, and the existing native request specification hash. The flow briefing and the node instruction stay in the established prompt policy.

The group scope calls `commit_trellis_loop_children` after it commits all child outputs. The call retains the exact output records and their receipt IDs in source order.

The condition producer calls `trellis_loop_condition_scope` before it allocates a native request. The returned scope contains only saved engine fields:

- `parentOccurrenceKey`
- `phase`
- `iterationPath`
- `inputReceiptIds`
- `groupDeadlineRefs`
- `deadlineAt`

An occurrence component calls `trellis_current_visit_scope` without a runtime input inside a loop. The root occurrence uses `capture_visit_scope`. `trellis_current_loop_policy` returns the saved `visitKey`, `maxRounds`, and phase for an internal condition callback.

The loop component calls `commit_trellis_loop_condition` when the native result returns. A complete trimmed `YES` completes the visit. A complete trimmed `NO` saves the exact feedback and starts the next round. A `NO` on `maxRounds` fails the visit.

Before a loop control port returns, it calls `record_control_output`. The `children` receipt keeps the exact saved child input text. The `done` receipt keeps the final joined child output text. The receipt keeps the complete control result separately from that public output.

Each loop subgraph shares the parent visit, human decision, and external-wait state. `trellis_checkpoint_root` identifies the graph that owns the durable checkpoint. The checkpoint adapter writes that root graph to the existing checkpoint store.
