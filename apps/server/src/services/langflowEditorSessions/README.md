# Restricted editor sessions

`createLangflowEditorSessions(options)` exports `issue(input)`, `fetch(Request)`, and `withDocumentSave(request, save)`.
The composition supplies the actual listener origins, host token, configured human actor, grant expiry policy, installed manifest, and committed document transport.
The actor provider reads the stored server actor setting and refuses an absent setting.
An actor header is an audit label. The host bearer authenticates access to the local Trellis host.

The parent and editor use separate origins on the same hostname and scheme.
Different listener ports supply that separation.
The editor listener serves static files without document content or credentials.
The host token remains at the parent boundary.

`issue({flow, expectedVersion})` returns `Promise<EditorSessionIssueResult>` for an authenticated host adapter.
`EditorSessionIssueInput` and `EditorSessionIssueResult` export from this service's public barrel.
The result contains `{session: EditorSession, credential: {token: string, expiresAt: Date}}`.
The public response contains only `session`.
The private `credential.token` supplies the `trellis_editor` cookie value.
The adapter sets HttpOnly, SameSite=Strict, no Domain, and the path `/api/trellis-editor/v1/sessions/${session.channel}`.
It uses `credential.expiresAt` for Expires and adds Secure for an HTTPS parent origin.
The adapter owns host authentication, exact parent-origin checks, cookie headers, and HTTP error translation.
The plain method throws the original issuance errors with their status codes.
Both methods use the same grant map and configured human actor.

`POST /api/trellis-editor/v1/sessions` accepts `{flow, expectedVersion}`.
It requires the host token and exact parent Origin.
It calls `issue(input)` after authentication and input validation.
The shared issuer reads the actual saved document and verifies its installed component manifest before it issues an `EditorSession`.
The expiry comes from the explicit `expiresAt(now)` policy.
The response sets an HttpOnly, host-only cookie with the path `/api/trellis-editor/v1/sessions/:channel`.
HTTPS adds Secure. SameSite is Strict.

Each channel permits these HTTP operations:

- `GET /session`: the shared `EditorBootstrapSchema`, with cookie and origin checks.
- `GET /document`: the current authorized document.
- `PUT /document`: a restricted compare-and-set save.
- `GET /component-manifest`: the installed public manifest.
- `GET /grant`: the original session after validation.
- `DELETE /grant`: revocation and cookie removal.

The paths above follow the cookie path.
Except for bootstrap, each request supplies `x-trellis-editor-identity` with the original identity JSON.
It also supplies `x-trellis-editor-project` with the saved project key, or an empty value for a global flow.
These fields can restrict a request. They cannot create authority.
GET requests accept the exact parent or editor Origin, or an exact origin from Referer when Origin is absent.
Mutations require Origin.

The parent draft queue keeps `flowDocumentsV1.save` as its transport.
After host authentication, its procedure passes `x-trellis-editor-channel` to `withDocumentSave({channel, actor, input}, save)`.
The actor must match the configured human actor and the issued grant.
The callback performs the existing document save, including HTTP preconditions, and returns only after commit.
The hook excludes concurrent saves for that channel until the callback returns.
It advances the separate authorized revision only after the receipt identifies that request.
The bootstrap identity remains fixed for the frame mount.

`readDocument(ctx, tx, {flow})` reads the production document and its actual project ID.
`saveDocument(ctx, tx, {document, projectId})` verifies the project and revision in the save transaction.
`readSaveReceipt(ctx, tx, {flow, requestId})` reads the durable request bytes and the original committed receipt.
These services use the caller's transaction.
The composition registers these services and supplies their committed transport calls through `options.documents`.
The HTTP process owns the grants; a process restart invalidates them.

The raw gateway retains exact HTTP body bytes and response bytes for each request ID.
The parent hook retains `JSON.stringify(input)` and the committed receipt for the validated API input.
The parent hook does not claim to retain the raw oRPC envelope.
Both paths check expiry, revocation, actor, project, flow, installed manifest, and current authority before receipt replay.
An admitted request remains pending when its callback fails before the response.
Its exact retry reads the durable receipt before the current revision check.
A recovered receipt must identify the previously admitted request bytes.
A pending request blocks a different save request until the original result is known.
An accepted receipt remains readable after another grant saves a later revision.
A version conflict blocks further saves from that grant.
An external save never advances the grant through a document read.

`installedManifest()` supplies the installed manifest hash, its public frontend catalog, and `assertContent(content)`.
The validator must reject component substitution and provider or engine credentials before the gateway returns content or saves it.
It must validate installed templates and editable fields against the actual package.
The gateway never forwards requests to a general engine API.
Execution, Playground, sharing, Python, imports, variables, provider keys, component replacement, and decision routes all fail closed.

The focused fixtures exercise plain issuance, real document services, and the actual HTTP handlers against an in-memory database.
Their manifest provider is an explicit test fixture.
They do not prove installed template validation, mounted editor behavior, listener composition, or a production installation.
