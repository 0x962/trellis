# Gate decisions

`reviewGate` accepts the execution identity, reviewed diff, and gate settings from its immutable publication.
The caller supplies those stored settings and a gate node ID from that publication.
It must not substitute the current editable document.

The service claims one classification receipt per execution before it reads GitHub or calls Jev.
The request bytes contain all published Jev gate settings in node-ID order.
The storage layer checks the publication, diff, reviewed head, and exact request bytes on repeat calls.
Concurrent gate calls receive the same pending receipt.
A completed classification supplies independent frontend and backend answers.

`classificationStore` owns durable claims and results in `db/queries/langflowExecution/classification.ts`.
The recovery owner calls its `interrupt` method only after it confirms that the prior request cannot complete.
An interrupted request remains failed and does not call Jev again.
The cancellation owner records failure before it accepts a late provider result.
The exact claim token protects each terminal write.

`classifyReviewArea` uses the complete GitHub path reader and the existing enabled-provider lookup.
The legacy scheduler calls the same classification function.
The question and criteria remain byte-for-byte equal to the legacy classifier input.
Provider and GitHub requests run outside transactions.
Jev gates use no native attempt or terminal.

`reviewGateResult` derives a gate decision and output from the saved classification and the published review area.
The execution projection must bind the accepted engine occurrence to that classification receipt.
The service returns values to Langflow; Langflow selects subsequent branches.

`nativeGateDecision` reads `NativeResultV1.output` and `exitKind`.
Only a completed result with the entire trimmed answer YES or NO supplies a decision.
The comparison ignores case.
Invalid output and other exit kinds return `unknown`.
The native bridge retains responsibility for durable completion, exact attempt identity, and failure state.

The focused fixtures use deterministic GitHub and provider responses.
They do not authorize or perform a real provider call.
