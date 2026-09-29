# Dense editor proof source

TRL-673 owns this source. It prepares the later editor and run-view checks.

Navid requires verification after the complete Langflow merge. No fixture, test, build, HTTP listener, or browser check ran for this source.

## Existing design acceptance

[The independent UI-F6 addendum](trellis://resource/01M3NXK8ZZ75KZDA83KEPWTM86) accepts the published schematic design.
Its [version 1 supplement](trellis://page/01M3NX6CKBX6MDKVPDXQGGH8B3) contains 48 nodes, eight groups, and 50 round summaries.
That result covers search, explicit reveal, nested groups, skipped branches, round navigation, and terminal return.
It does not prove the full editor, real decision receipts, or engine performance.

## Source inputs

`denseGraph/createDenseGraphFixture` clones the seven definitions from TRL-672.
The factory preserves component definitions and changes only field values, node identities, and layout.
The source requires the final PR 573 fix that makes each outer node ID equal to `data.id`.
Its graph schema and component definitions come from `integrations/langflow/editor-probe/src/langflowGraphFixture.ts`.
The source handoff reads PR 573 at `559ea448a42fb8b0992bcd5e97a809ef297876d4`.
That source includes the matching-ID schema and the flow-list initialization repair.

The source encodes handles in the format used by pinned Langflow commit `fec71dca901949c09ed4d63315804337cd2eb13d`.
`src/frontend/src/CustomNodes/utils/get-handle-id.tsx` defines the input and output fields.
`src/frontend/src/utils/reactflowUtils.ts` sorts object keys and replaces JSON quotes with `œ` in handle strings.
Edges use list inputs, which permit several connections. The edge data retains the corresponding handle objects.

| Case | Nodes | Edges | Outer rounds |
| --- | ---: | ---: | ---: |
| `required-density` | 500 | 2000 | 50 |
| `beyond-former-cutoffs` | 501 | 2001 | 51 |

These cases are fixture sizes. They define no application ceiling.
Agent instructions repeat one sentence 4096 times to exercise long text.
The graph includes nested loop and group references in the existing `children` fields.
The separate outline records the expected hierarchy. It does not add an outline implementation to Langflow.
The dense edges exercise layout and navigation. Their engine execution remains unverified.

`denseExecution/createDenseExecutionFixture` consumes the public TRL-665 types and examples.
It returns an immutable snapshot, full loop paths, a round-37 human wait, and a skipped backend occurrence.
The correctness occurrence has two attempts. `terminalTarget` names attempt `attempt-37-2` and its exact occurrence.
Each round uses a distinct fixture agent ID. A null workspace commit retains the public unknown value.

`progressUpdate` changes an unrelated round-36 result while retaining the selected round-37 identities.
`decisionDeliverySequence` supplies recorded, pending, unknown, and confirmed display inputs in order.
Apply one delivery at a time. The fabricated receipt is a fixture value, not a receipt from the engine.
The snapshot hash comes from the generated graph. Its publication carries the same hash and fixture manifest identity.

## Deferred verification

[The verification matrix](verification-matrix.md) lists the required evidence and the later checks.
Each row remains pending. Source preparation does not satisfy the ticket's rendered or runtime acceptance.

After the complete merge, validate both factories against `LangflowGraphDocumentSchema` and `FlowExecutionViewV1Schema`.
Check the graph counts, unique node and edge IDs, matching inner IDs, valid handles, and pinned component definitions.
Check every occurrence parent, full iteration path, terminal target, and decision occurrence before browser use.
Run the linters and type checks that cover these files at that same integration point.

The integration owner must connect the fixture document to the actual gateway through an explicit source handoff.
The current TRL-672 gateway starts with its seven-node fixture. This source does not change that default.
Use Aside for the actual editor and run-view evidence. Keep native-mobile support as a separate user decision.
The full-editor fork, separate editor, and latency budgets still require the decisions recorded by TRL-674.
