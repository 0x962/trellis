# Editor mount and display bridge

`LangflowEditor` mounts the full editor under the caller's existing Trellis topbar.
Its source lives in `apps/web/src/features/flows/LangflowEditor/`.
The component requires a separate editor origin and an active, expiring session from the host.
The host owns authentication, grant revocation, the catalog, and the HTTP policy.
The browser session object contains identity and expiry metadata, not credentials.
`session/` exports `EditorSessionSchema` for the parent and `EditorBootstrapSchema` for the child.
The authenticated issuer accepts the flow and expected revision. It derives the actor and host from the server.
The frame URL carries `trellisChannel` as a public lookup key.
The child reads its bootstrap through authenticated `GET /api/trellis-editor/v1/sessions/<uuid>/session`.
The issuer supplies the exact parent origin and saved project key. The channel does not authorize that request.
The separate editor origin requires its own host-provisioned cookie and revocation checks.

`protocol/` defines version 1 of the display bridge.
Every message names the channel UUID, host, actor, flow, initial revision, document hash, and component manifest hash.
These values identify the original mount. A save receipt does not replace them.
A new mount needs a fresh channel UUID and the latest retained draft from the save owner.

The parent sends `initialize` after the frame loads.
The child sends `connected` after it attaches its listener. The parent repeats initialization once for a late connection.
The frame applies that content, disables its own persistence path, then sends `ready`.
Only after this acknowledgement does the parent accept draft and selection events.
Each sender increases its sequence. The receiver refuses a duplicate or older event.
The parent checks the exact frame window and origin before it reads the message.
Revocation, expiry, and unmount stop message acceptance. An unexpected frame reload requires a new session.
`onAccessEnded(reason)` reports `revoked`, `expired`, or `reloaded` to the parent queue owner.
The queue must also check the current actor, host, grant state, and expiry before each request.

`draftChanged(content)` receives the complete public V1 Langflow content.
`LangflowWorkspace` passes this content through `useDocumentAutosave` to the single draft/save queue.
The wrapper sends the exact queued input to `client.flowDocumentsV1.save`.
It checks the current actor and host against the grant before each request.
The caller supplies `currentIdentity`, the tab identity, browser storage, the saved document, and the issued session.
The workspace remounts when the channel changes and initializes the frame from the retained draft.
Its topbar exposes save state and explicit retry. It reuses `FlowSettingsSheet` for metadata.
The hook keeps the queue alive across remounts and stops later requests when the workspace releases it.
The browser-draft dialog exports exact bytes, including unsupported records and a draft held only in memory.
Recovery copies the selected record into a fresh tab and retains the source.
Discard requires confirmation and the exact displayed bytes.
`onOpenDraft(tab)` asks the route to read the saved document, issue a new session, and mount the selected tab.
The actual route still requires the session issuer.
The adapter creates no timer for autosave, HTTP save request, local draft store, or run request.
A draft event cannot establish a saved revision, executable publication, or accepted decision.
The authenticated save service must validate the document and the pinned component authority.

`selectIssue({ nodeId, field })` asks the frame to reveal the node's ancestors and focus its field.
`restoreFocus()` sends the last selection back to the frame.
`frameDriver/` validates parent commands against the bootstrap identity, origin, channel, and sequence.
Its `initialize` callback disables editor persistence and applies the supplied draft before it resolves.
The driver then subscribes to draft and selection changes and acknowledges the parent.
Disposal during initialization prevents this acknowledgement and subscription.
The pinned editor entry supplies actual node selection, ancestor reveal, and focus actions.
It attaches its message listener before it sends `connected`.
Selection messages carry no execution authority.

## Pinned entry patch

`frontend/` supplies the native entry, store subscription, viewport updates, ancestor reveal, and field focus.
The matched Langflow frontend owns its type check because these modules import its native stores and types.
`patches/compose.py` generates `production-entry.patch` from these modules and the schemas in `packages/api/src/schemas/`.
It copies `flowEditorProtocolV1.ts` and `flowEditorSessionV1.ts` into the native frontend.
The copied compatibility modules import those local files. The manifest records the original schema hashes.
It reads the pinned source without mutation, applies the exact probe patch in temporary files, and verifies the generated patch.
The script removes those files when it exits. `series.json` records the source pin and patch hashes.
The native lock contains Zod 3.25.76. The copied schemas use its `zod/v4` export.
The Trellis source uses its own pinned Zod dependency.

```sh
python3 integrations/langflow/editor/patches/compose.py <pinned-engine-repository>
```

The production build sets `VITE_TRELLIS_EDITOR_BRIDGE=true` and leaves `VITE_TRELLIS_EDITOR_PROBE` false.
Production mode mounts the restricted full editor shell and its native canvas controls.
It removes the probe Save control. Native save hooks cannot send a write.
The initial flow read waits for parent content and overlays it on metadata from the scoped document route.
The native store subscription sends complete graph content to the parent queue.
The graph retains top-level fields outside nodes, edges, and viewport.
Viewport movement also emits a draft change.
Inspector focus emits the exact node and field through the native field wrapper.
The listener detaches when the bridge releases its store subscription.

`scopedReads/` sends cookie-authenticated GET requests with `referrerPolicy: origin` and rejects redirects.
Bootstrap precedes the immutable identity and exact project headers on later requests.
The gateway permits the exact editor-origin Referer when a GET has no Origin header.
Issuance requires the configured parent Origin and host bearer.
The catalog response is the verified installed manifest object from TRL-845.
The palette uses only approved exported frontend templates. An entirely blocked catalog reports an error.
The current catalog has no approved frontend templates.

The gateway must permit the exact Trellis parent origin and enforce the real grant on every request.
It must deny execution, provider keys, raw Python, imports, and component replacement.
TRL-696 owns the authenticated issuer and gateway composition. TRL-685 owns the packaged editor build.
TRL-696 owns the route composition. The actual route still requires its registered session procedure.
`frontend/EditorInteractions` adds the outline and connection dialog to the native toolbar.
`EditorOutline` lists native nodes with their ancestor paths and retains access to every match.
`KeyboardConnections` filters exact native handles through `isValidConnection` in `src/utils/reactflowUtils.ts`.
It creates, replaces, and deletes edges through the native store.
`graphActions` snapshots the full graph before a change and deletes native descendants with their connected edges.
The patch routes native deletion controls through this helper and snapshots pointer reconnections.
Native `takeSnapshot`, `undo`, and `redo` in `src/stores/flowsManagerStore.ts` retain every bridge history entry.
The history contains nodes and edges, including field values and layout.
Semantic source groups still require their published expansion contract; native parent IDs describe the canvas hierarchy.

The native sidebar already adds components with Enter or Space.
Its `handleKeyDown` lives in `src/pages/FlowPage/components/flowSidebarComponent/components/sidebarDraggableComponent.tsx`.
It calls `useAddComponent` with the installed palette definition.
The native fixture beside that component covers those keys; the combined browser proof must use that actual path.
`frontend/EditorInteractions/__tests__` supplies mounted selector and outline fixtures plus exact graph undo assertions.
The production patch copies these fixtures into the matched frontend for its Jest suite.
`NativeInspector` edits a local copy of the installed node template.
Save checks for concurrent changes and preserves the template metadata. Cancel leaves the graph unchanged.
The form exposes text, multiline text, booleans, numbers, and declared string choices.
`DeclaredField` supplies the same controls in the native inline inspector.
`NumericField` rejects invalid input without a silent replacement value or an arbitrary maximum.
Internal control inputs stay read-only. Fields bound to `trellisSource` require the atomic source editor owned by TRL-695 and TRL-684.
The source editor must regenerate associations, request specifications, and group or loop policy together.
A client hash calculation cannot authorize an edit to those bindings.
`NativeInspector/__tests__` covers Save, Cancel, reopen, concurrent changes, large values, and bound fields.
These fixtures and the rendered interaction proof remain unrun.
The existing probe paths, patch, and shared candidate remain under their owners.

## Verification

Run these commands after the source batch merges:

```sh
bun test integrations/langflow/editor/editorChannel integrations/langflow/editor/frameDriver integrations/langflow/editor/scopedReads integrations/langflow/editor/fieldFocus
bun x --no-install tsc --noEmit -p integrations/langflow/editor/tsconfig.json
bun x --no-install @biomejs/biome check integrations/langflow/editor apps/web/src/features/flows/LangflowEditor
cd apps/web
bun run typecheck
```

The fixtures cover the message boundary. They do not prove a mounted Langflow editor or gateway denial.
ENG-F11 and ENG-F18 still require the actual pinned editor, typed inspectors, keyboard interactions, and persisted fields.
Rendered acceptance includes 320 px, both themes, focus return, revoked grants, and the real gateway's direct-run denial.
