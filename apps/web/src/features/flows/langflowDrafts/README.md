`createDraftStorage` stores one draft per host, actor, flow, and tab.
The host identity includes the data home. The actor includes its kind and name.
The flow identity is its stable ID. Each open editor owns a unique tab identity.
The adapter retains that identity across a reload and assigns a new identity to a duplicate tab.

`create` refuses an existing draft. `read` returns its parsed record or its unsupported bytes.
`list` finds every tab for the exact host, actor, and flow, including abandoned offline drafts.
`readBytes` exports the complete record. `discard` requires the exact identity and expected bytes.
Storage errors propagate to the caller. A failed write does not establish local retention.

The adapter supplies `DraftContent` from the public V1 save input.
For a new draft, `savedContentJson` holds the original saved content and `contentJson` holds the edited content.
Before conversion, the adapter stores the exact legacy source in `legacyBytes` and calls `create`.
Conversion starts only after this write succeeds. The legacy source remains available through `readBytes` until explicit discard.

`createSaveQueue` owns one recovered or new record. The adapter creates one queue per editor identity.
`save` accepts `FlowDocumentSaveV1Input` and returns `FlowDocumentV1`, as the exported `flowDocumentsV1.save` contract requires.
The adapter forwards this input unchanged through the typed client after TRL-696 registers that service.
`edit` copies and retains new content. `flush` serializes requests and advances the base version only after acknowledgement.
The queue retains the exact request JSON and UUID before the request leaves the browser.
An explicit `retry` reuses this submission after a network error. Newer edits wait for its receipt.
A conflict or unsupported format blocks writes across reloads. Recovery requires an explicit user choice outside the queue.
`snapshot` returns immutable copies for the adapter. `retained` confirms the latest successful write from this queue.
`saved` describes server acknowledgement. The receipt carries publication state separately.

The rollback adapter supplies `readOnly: true`. Reads and exports remain available.
The adapter owns debounce, React notifications, editor validation, and the lifetime of in-flight requests across unmounts.
TRL-679 supplies the editor adapter. TRL-680 owns mounted-effect and editor acceptance.
The legacy autosave hook and TRL-711 transfer helpers keep their current callers.
Versioned drafts use a separate namespace and export through `readBytes`.

The merged verification batch runs the tests under this directory, the web type check, and Biome on these files.
The source checkpoint does not establish browser, runtime, or publication acceptance.

`documentSession` retains one queue for each storage object and exact draft identity.
Its `attach` method grants one mounted editor access. The returned release function suspends the queue.
A suspended queue accepts its pending receipt, retains newer bytes, and starts no further request.
`resume` requires an explicit caller action. `setReadOnly` applies rollback access to the same queue.
`canDispatch` checks the current grant, host, and actor immediately before each save call.
The caller must supply a predicate that reads current authority, including grant expiry.
`subscribe` reports edits, request progress, receipts, and storage errors to mounted consumers.
An unsupported record stays exportable and cannot create a queue.

`createDocumentRecovery` lists and exports drafts for one host, actor, and flow.
`recover` copies exact confirmed bytes into a new tab identity. It retains the original draft and request identity.
`discard` requires the named draft identity and its exact bytes.
`preserveLegacy` retains the original bytes as an unsupported draft before any conversion.

`beginExplicitEdit(document)` suspends the queue before it awaits the current graph save.
The adapter first stops frame edits. A lease requires a clean draft and a known save outcome.
The lease returns the acknowledged `base`; the adapter uses its identities for the intent.
`dispatch(intent, send)` stores the exact request JSON and base document before the typed client call.
The public `ConversionEditIntentV1Schema` validates the intent. `FlowDocumentActionResultV1` defines the result.
`replay(send)` uses the retained bytes and checks current access before each call.
A pending result or transport error retains the lease across unmounts and browser reloads.
Ordinary edits, autosave, resume, and discard cannot remove this pending identity.

`release()` permits Cancel before dispatch or a definitive blocked result.
It preserves graph bytes and leaves the queue suspended. The adapter checks current authority before it explicitly resumes.
`acceptCommittedDocument(document)` accepts only the document from this lease's committed receipt.
It replaces the clean base after local storage succeeds and leaves the queue suspended.
The adapter mounts a fresh grant and frame from that receipt. It does not merge a regenerated graph with local edits.
Storage refusal preserves the pending intent and permits another attempt to retain the receipt.
