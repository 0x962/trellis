# Trellis loop control

The patch adds durable loop visits to the Langflow graph checkpoint. Langflow graph edges select each child phase and condition phase.

`begin_trellis_loop_visit` creates one restart-stable visit from the loop node, parent occurrence, and inherited iteration path. It accepts the positive `maxRounds` from the sealed component definition. The condition producer reads the immutable harness and prompt from the published graph document.

The group scope calls `commit_trellis_loop_children` after it commits all child outputs. The call retains the exact output records and their receipt IDs in source order.

The condition producer calls `trellis_loop_condition_scope` before it allocates a native request. The returned scope contains only saved engine fields:

- `parentOccurrenceKey`
- `phase`
- `iterationPath`
- `inputReceiptIds`
- `groupDeadlineRefs`
- `deadlineAt`

The loop component calls `commit_trellis_loop_condition` when the native result returns. A complete trimmed `YES` completes the visit. A complete trimmed `NO` saves the exact feedback and starts the next round. A `NO` on `maxRounds` fails the visit.

Each loop subgraph shares the parent visit, human decision, and external-wait state. Its checkpoint adapter writes the parent graph to the existing checkpoint store.
