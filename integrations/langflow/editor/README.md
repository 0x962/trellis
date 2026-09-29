# Editor mount and display bridge

`LangflowEditor` mounts the full editor under the caller's existing Trellis topbar.
Its source lives in `apps/web/src/features/flows/LangflowEditor/`.
The component requires a separate editor origin and an active, expiring session from the host.
The host owns authentication, grant revocation, the catalog, and the HTTP policy.
The browser session object contains identity and expiry metadata, not credentials.
`session/` exports `EditorSessionSchema` for the parent and `EditorBootstrapSchema` for the child.
The authenticated issuer accepts the flow and expected revision. It derives the actor and host from the server.
The frame URL carries `trellisChannel` as a public lookup key.
The child reads its bootstrap through authenticated `GET /api/trellis-editor/v1/session?channel=<uuid>`.
The issuer supplies the exact parent origin. The channel does not authorize that request.
The separate editor origin requires its own host-provisioned cookie and revocation checks.

`protocol/` defines version 1 of the display bridge.
Every message names the channel UUID, host, actor, flow, initial revision, document hash, and component manifest hash.
These values identify the original mount. A save receipt does not replace them.
A new mount needs a fresh channel UUID and the latest retained draft from the save owner.

The parent sends `initialize` after the frame loads.
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
Recovery selection, export controls, and the actual route await the session issuer.
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
It must attach its message listener before the parent sends initialization after frame load.
Selection messages carry no execution authority.

## Integration prerequisites

The pinned TRL-672 probe build has no parent bridge.
It retains a separate save hook and fixture authentication.
Its gateway currently permits only its own origin in `frame-ancestors`.
Do not mount that build as a production editor with this adapter.

The production build must implement this handshake before it sends `ready`.
It must disable the pinned save hook and every direct execution path.
The gateway must permit the exact Trellis parent origin and enforce the real grant on every request.
The gateway must deny execution, provider keys, raw Python, imports, and component replacement.
TRL-696 owns the authenticated issuer and gateway composition. TRL-685 owns the packaged editor build.
TRL-696 owns the route composition. This source does not register a production route.

The published fixture catalog uses text fields and one Result output per component.
It does not define native Yes/No ports, group boundaries, or the production inspector schema.
Typed inspectors, keyboard edges, deletion, nested groups, and the outline require those accepted definitions.
The existing probe paths and patch remain under TRL-672 ownership.

## Verification

Run these commands after the source batch merges:

```sh
bun test integrations/langflow/editor/editorChannel/editorChannel.test.ts integrations/langflow/editor/frameDriver/frameDriver.test.ts
bun x --no-install tsc --noEmit -p integrations/langflow/editor/tsconfig.json
bun x --no-install @biomejs/biome check integrations/langflow/editor apps/web/src/features/flows/LangflowEditor
cd apps/web
bun run typecheck
```

The fixtures cover the message boundary. They do not prove a mounted Langflow editor or gateway denial.
ENG-F11 and ENG-F18 still require the actual pinned editor, typed inspectors, keyboard interactions, and persisted fields.
Rendered acceptance includes 320 px, both themes, focus return, revoked grants, and the real gateway's direct-run denial.
