# Flow discovery and settings

`FlowsPage` reads the flow list and each saved document through the typed client.
`FlowDiscoveryContent` presents the saved version, executable revision, and publication diagnostics.
The settings sheet reads the document by stable flow ID.
Metadata save and delete use the existing flow handlers.

The document contract does not report live engine availability or conversion capability.
The interface identifies these facts as unknown.
An unpublished Langflow revision cannot permit a new run.
A published receipt alone does not establish live engine availability.

`discoveryPosition` retains filters and scroll in session storage.
A project filter includes flows for that project and flows for every project.
The list restores its scroll after the document results arrive.

The settings form retains the version from the time the form opens.
A metadata conflict retains the edits and disables Save changes.
Reload and discard edits reads the latest document and replaces the form values.
A deleted flow retains selectable form text and a link to the flow list.

The shared client batch covers the focused tests, Biome, and the web type check.
TRL-678 retains mounted desktop, narrow layout, both themes, keyboard, focus, and live state acceptance.
