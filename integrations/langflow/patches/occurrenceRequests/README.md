# Engine occurrence requests

This fragment adds `langflow.services.trellis_v1.occurrence_requests` and its supporting modules.
The pinned engine is `fec71dca901949c09ed4d63315804337cd2eb13d`.
Apply this fragment after the assembled admission, publication, authority, native receiver, and external-wait fragments.

`run_native_visit(graph, vertex_id, scope)` returns the unchanged native result after the exact wait completes.
`request_native(graph, vertex_id, scope)` returns the retained external wait bytes.
`run_human_visit(graph, vertex_id, scope, *, max_rounds)` returns the full accepted decision.
NO feedback creates another durable wait. An exhausted approved round limit raises `HumanRoundLimit` after feedback commits.

`VisitScope.from_engine(value)` accepts the actual control scope with these fields:

| Field | Producer |
| --- | --- |
| `parentOccurrenceKey` | Persisted parent engine visit |
| `phase` | Actual child or condition control path |
| `iterationPath` | Complete saved loop stack, with actual positive rounds |
| `inputReceiptIds` | Committed outputs in actual input order |
| `groupDeadlineRefs` | Original persisted group deadlines |
| `deadlineAt` | Original effective deadline, or null |

The group and loop controls supply this internal scope. They must retain it before a call.
`capture_visit_scope` captures root inputs from selected incoming engine edges and retains their receipt order.
The caller obtains `vertex_id` from the actual engine vertex.
The producer reads its static specification from the admitted publication, through `Job.flow_id`.

## Static specification

`graphDocument.trellisRequestSpecsV1[engineVertexId]` contains:

```json
{"nodeId":"source-node","taskKeyBase":"review","name":"Review","instruction":"exact text","harness":null}
```

`accountId` is optional and must be a string when present.
A nonnull harness has `preset`, retained `startCommand` and `resumeCommand`, and optional string `model` and `effort` fields.
Native dispatch requires a nonnull resolved harness. Human entries can retain null.
Publication must resolve commands and model policy once; request execution cannot supply current defaults.
`RequestSpec` rejects extra fields. Hash the original object, not the parsed model with defaults.
`validate_spec` returns SHA256 of recursive ordered compact UTF-8 JSON, with exact strings and array order.
The serialization matches `documentBytes` for this strict schema.
`task_key` serializes `[taskKeyBase,nodeId,parentOccurrenceKey,phase,iterationPath.map(v=>[v.loopNodeId,v.round])]`.
Conversion associations and their source hashes remain separate from this static specification.
Prompt assembly from briefing, runtime inputs, and target context remains an explicit integration requirement.

## Transactions and replay

`occurrence_store.locked_context` locks the existing Job row and reads its permanent admission and immutable publication.
`occurrence_journal.allocate` assigns request, occurrence, action, and wait identities once per semantic visit.
`JobCheckpoint(job_id, kind="trellis-occurrences-v1")` holds the JSON `revision` and `visits` fields.
The saved visit retains exact request bytes, scope facts, handle bytes, previous waits, and full NO feedback.
Human `expectedRevision` copies the allocated journal revision once. Public view revisions have separate meaning.

`request_native` commits the journal, graph checkpoint, and receiver request record before the HTTP call.
The receiver record uses `native_records.request_kind(wait_id)` and the original request string.
An uncertain response leaves those bytes intact. A later authorized call uses the same request.
The reservation obligation and `native_reservation` wait commit before HTTP.
The matched external-wait fragment supplies the runner and queue consumers.
The unchanged handle response commits with the native wait in the existing graph checkpoint.
`run_human_visit` commits the journal and replacement graph wait in one transaction after NO feedback.
The graph lock precedes the Job lock. Network calls occur outside both locks.
`GraphCheckpoint.external_waits` holds pending waits.

## Bootstrap and integration

Call `occurrence_transport.install_request_transport(origin: str, authentication_file: Path)` with keyword arguments before recovery.
Use the explicit outgoing origin and credential from trusted host configuration.
The producer checks current `native.reserve` authority under the Job lock for each dispatch.
It supplies that authority's capability to the existing native request client.

Apply `0001-engine-occurrence-requests.patch`, then `0002-component-entry-receipts.patch`.
The second fragment requires the matched group and loop controls for their saved scope readers.
Group and loop owners call the exported operations from their actual engine controls.
Native and human components call the visit operations. TRL-688 owns native prompt composition from the retained receipts.
An omitted model or effort does not prove a fixed provider choice. Publication must resolve that policy explicitly.
Native reservation must reject account selection that replaces the retained harness.
Jev pending classification requires its own agreed continuation contract before a request operation can use this journal.
Catalog publication and conversion blockers remain in force until the complete engine traces pass.

## Component receipts

`occurrence_scope.capture_visit_scope(graph, vertex_id)` returns a saved `VisitScope` from actual engine edges and control state.
`VisitScope.to_engine()` returns the exact camel-case mapping for group and loop controls.
Root entries have a null parent and an empty iteration path.
An input edge without a committed output receipt stops the visit.

`occurrence_controls.allocate_control_visit(graph, vertex_id, scope, node_id)` retains a group occurrence under the Job lock.
It verifies the original group node ID against the immutable publication template.
The group component calls `activate_group_occurrence` with that occurrence before it opens the group.

`occurrence_outputs.record_control_output(graph, vertex_id, scope, occurrence, port, result, *, output)` commits a control receipt.
`output` is the exact text for downstream input. `resultBytes` retains the full canonical control result.
`component_output(receipt, state)` returns `trellisOutput` with `occurrenceKey`, `state`, `outputBytes`, and `receiptId`.
The state is `succeeded`, `failed`, or `canceled`.
Native data also retains the complete native result. Human data retains the complete decision.
A human loop condition returns its decision to the loop control, including NO, before the loop selects another round.
Root human NO creates another wait and does not return a component output.

Output records use `JobCheckpoint(kind="trellis-output-v1:" + receiptId)` and `receiptId="output:" + UUID`.
The public receipt contains `version`, `receiptId`, `executionId`, `publicationId`, `engineJobId`, `nodeId`, `occurrenceKey`, and string `output`.
The record retains its exact UTF-8 bytes and SHA256. Human output preserves original accepted decision bytes.
`read_input_receipts(session, job_id, request_bytes)` reads wrappers in the original request order.
The authenticated route must validate `native.read` authority in that same transaction.
Prior root NO receipts precede the final human receipt when a downstream edge selects that output.

All graph writes use `trellis_checkpoint_root` for a loop subgraph.
The shared external-wait dictionary keeps its identity after a commit.
Ordinary components without a receipt producer remain unsupported.

Deferred matched-batch command: `python -m pytest integrations/langflow/tests/occurrenceRequests`.
The fixtures cover receipt replay, exact output text, original decision bytes, and root checkpoint persistence.
Real graph traces, crash recovery, group ordering, and package export remain required.

## Reservation response recovery

Apply `0003-native-reservation-obligations.patch` after the component receipt fragment.
`occurrence_reservations.pending_native_reservation_obligations(session)` returns all pending reservation obligations.
Each record includes the job, request, and wait IDs, plus original request bytes and their digest.
The checkpoint kind is `trellis-native-reservation-obligation-v1:<waitId>`.

`recover_native_reservation(graph, wait_id)` returns `True`, `False`, or `"cancelled"`.
A true result means that the exact handle and replacement native wait committed.
A false result means that the HTTP response remains unknown. The request bytes and wait remain unchanged.
Cancellation prevents another reservation call. A late response retains its handle and a stop reconciliation requirement.
The existing runner raises `ExternalWaitPending` and releases the worker when a handle remains unknown.
The recovery consumer must use the existing engine queue.

`finish_native_reservation_obligation(session, job_id, wait_id, queue_result)` accepts `dispatched` or `execution_proven`.
It requires a confirmed handle and refuses acknowledgement for a canceled job.
The consumer calls it only after the corresponding queue result.

Cancellation acceptance remains blocked on a host lookup by original request bytes and an exact stop receipt.
The current public native reader requires a step ID, which an uncertain reservation response might not supply.
The canceled obligation remains pending until those producers supply durable proof.
The fixtures cover lost responses, exact replay bytes, cancellation before dispatch, and acknowledgement before confirmation.
These fixtures and the integrated crash cases remain deferred to the complete batch.
