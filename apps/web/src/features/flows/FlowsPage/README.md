# Versioned discovery source

`FlowDiscoveryContent` accepts a `FlowDiscoveryInput` and canonical actions from its caller.
`flowDiscovery` keeps the selected filters through loading, failure, empty results, and an engine outage.
A project filter includes flows for that project and flows for every project.

`FlowDiscoveryEntry.document` uses the public V1 contract.
The caller supplies compatibility, diagnostics, and capability reasons from the services.
A valid document alone does not establish migration parity or permission to start a run.
`FlowVersionDetails` presents these fields for cards and the settings sheet.

`flowPublicationReceipt` accepts only a receipt for the saved document and preserves an existing confirmed receipt.
`flowSettingsState` retains metadata edits after a conflict or deletion.
`flowSettingsRequest` blocks another save until the caller resolves that conflict.
`FlowSettingsFeedback` returns to `/ai/flows` and passes the retained filters to the caller.
The caller owns filter persistence and explicit conflict resolution.

TRL-678 connects these components to the handlers from TRL-684 after the acceptance gate.
TRL-696 owns service registration.
The existing route and settings sheet keep their legacy handlers.
The source tests use the exported TRL-665 fixtures.
The batch verification owner runs the tests, web type check, and changed-file Biome check after merge.
TRL-678 retains desktop, narrow layout, both themes, keyboard, focus, and live state acceptance.
