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
The root scope and input receipt producers remain integration requirements.
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
Suspension and recovery before the handle arrives still require the runner integration.
The unchanged handle response commits with the native wait in the existing graph checkpoint.
`run_human_visit` commits the journal and replacement graph wait in one transaction after NO feedback.
The graph lock precedes the Job lock. Network calls occur outside both locks.
`GraphCheckpoint.external_waits` holds pending waits.

## Bootstrap and integration

Call `occurrence_transport.install_request_transport(origin: str, authentication_file: Path)` with keyword arguments before recovery.
Use the explicit outgoing origin and credential from trusted host configuration.
The producer checks current `native.reserve` authority under the Job lock for each dispatch.
It supplies that authority's capability to the existing native request client.

The fragment adds files only. The assembly owner includes its patch after the required fragments.
Group and loop owners call the exported operations from their actual engine controls.
Component entry hooks, root scope capture, output receipt provenance, and prompt composition remain open.
An omitted model or effort does not prove a fixed provider choice. Publication must resolve that policy explicitly.
Native reservation must reject account selection that replaces the retained harness.
Jev pending classification requires its own agreed continuation contract before a request operation can use this journal.
Catalog publication and conversion blockers remain in force until the complete engine traces pass.
