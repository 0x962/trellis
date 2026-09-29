# Executable component catalog

`manifest.v1.json` is the shared catalog for the editor and converter.
Its schema version is 1.
Consumers hash the original UTF-8 JSON bytes with SHA256.
The release or caller supplies the expected digest to `readCatalog.read_catalog`.
The caller supplies `engine_commit` from its verified package identity.
The reader checks that identity, the manifest digest, and each listed source digest.
It requires no Git metadata.
`runtimeSources` hashes the reader and Python import files.
A package retains each declared relative path below its explicit `trellis_root` or `engine_root`.
The package also retains definition sources, source dependencies, and both edge-handle sources.
The trusted package digest binds the original manifest bytes before the reader runs.
A digest check proves source identity. It grants no execution authority.

The catalog contains these source definitions:

- `native-completion-v1`: the exact saved native result after an external wait.
- `external-wait-v1`: the existing receipt transport from TRL-669.
- `native-decision-v1`: YES/NO branches for a completed `NativeResultV1` value.
- `ordered-output-v1`: child outputs in source order, with two newline separators.
- `stock-loop`: the pinned Langflow loop, with its own item and done ports.

`nativeRequest.request_native_attempt` sends original UTF-8 request bytes to the private native-reservation endpoint.
Trusted bootstrap supplies `origin`, `authentication_file`, and `capability_id`.
The function returns the original UTF-8 response text.
It disables ambient proxies and redirects and makes one request.
The caller retains the request identity after an unknown result.

Credentials are runtime arguments, separate from saved component fields.
The engine occurrence producer must call this client before it creates the native wait.

`native-completion-v1` accepts exact prebuilt native `ExternalWaitV1` bytes.
It requires the request job to match `graph.job_id`.
`Graph.await_external_completion` owns suspension.
`TrellisExternalWaitBroker.delivery_for` reads the stored delivery for that exact job and wait.
The component returns the unchanged `delivery.result` as `Data.data`.
The catalog hashes the required external-waits patch with the component source.

`native-decision-v1` accepts a host-validated `NativeResultV1` in `Data.data`.
It preserves the complete result on either output.
It accepts only a complete YES or NO answer, with the legacy whitespace and case rules.
Langflow excludes the other branch and selects successors.
The component raises `native_gate_decision_unknown` for other answers or failed native results.

`ordered-output-v1` accepts completed child records in `Data.data`.
Each record has a unique `nodeId`, a `text` string, and any retained output references.
`child_ids` contains the ordered JSON array of those exact child IDs.
The component requires one record per child and preserves every child record in `children`.
The output `text` joins their original text with two newline separators.
The component collects data after engine dependencies settle.
It cannot establish scope entry, skipped children, group deadlines, or loop order.

Every legacy mapping has `status: blocked` and explicit blocker codes.
The data components cover parts of native, gate, and group behavior.
They do not authorize a full legacy node conversion.
A host must produce and validate receipts before it supplies component inputs.
Executable native reservation, human request creation, and Jev invocation remain dependencies.
Group scope expansion and the child-then-condition loop remain dependencies.

`template` records the source input declarations and their payload contracts.
`frontendTemplate` is null in these source declarations.
`pythonModule` names the module that defines each engine class.
`exportTemplates.export_frontend_templates` exports complete templates to a separate versioned document.
The [export contract](exportTemplates/README.md) defines its inputs, identity, and consumer fields.
The catalog cannot authorize editor publication while `allowedForPublication` is false.
Consumers must not treat source presence, a port match, or a metadata destination as a supported mapping.

`preservation` names the complete legacy field inventory and its retained destinations.
Those destinations describe a source envelope, not executable graph inputs.
The converter keeps missing fields missing, null fields null, and strings unchanged.
It retains node and edge array order and original parent-relative coordinates.
The converter supplies executable node and edge associations only after a mapping passes its engine trace.
All executable associations remain null at this checkpoint.

`edgeHandles` describes Langflow's source and target handle objects.
The editor serializes those objects with its pinned handle utility.
The utility calls `customStringify`, then replaces each double quote with U+0153.
The engine receives the same objects under `edge.data`.
A loop feedback handle differs from an ordinary input handle.
No legacy edge maps to loop feedback until the loop mapping passes.

The source inventory and fixtures are public synthetic data.
Private Review exports stay outside this directory.
TRL-667 runs `tests/catalog` only after the source merges, in the retained engine environment.
