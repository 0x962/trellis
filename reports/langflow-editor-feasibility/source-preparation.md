# Langflow editor source preparation

## Result

Navid selected the pinned full-editor fork inside Trellis. Note `01M3Q242R632TB5G9CSYVX909R` records the decision.

TRL-667 measured the shared unmodified candidate and its isolation profile. Source review accepts the direct-load and gateway boundaries. No accepted patched editor or browser proof exists yet.

## Source pin

| Item | Value |
| --- | --- |
| Langflow release | `v1.12.3` |
| Source commit | `fec71dca901949c09ed4d63315804337cd2eb13d` |
| Root tree | `e6ac634257b30645b6c35bcc707ed271789877d6` |
| Frontend tree | `63f7b72114d42755ed55348c30728ccef4bf5532` |
| Frontend inventory | 3,033 blobs, 49,419,577 bytes |
| `package.json` | Blob `40e188f9fbfb155769890cb7662a8e04371f3f1d`, 7,688 bytes |
| `package-lock.json` | Blob `b6db4ca27a64175777dbc8388514d710da8f7a44`, 788,094 bytes |

GitHub returned a complete recursive tree. The response set `truncated` to `false`.

TRL-667 owns the one authorized candidate and every process that uses it.

## Candidate measurements

These measurements describe the unmodified shared candidate. They do not prove the patched editor behavior.

| Item | Measured result |
| --- | ---: |
| Locked packages | 1,428 |
| Install time | 40.46 seconds |
| Install maximum RSS | 554,287,104 bytes |
| `node_modules` allocated size | 1,103,604 KiB |
| Clean build time | 28.36 seconds |
| Build maximum RSS | 3,897,720,832 bytes |
| Built assets | 1,880 files, 24,672,326 logical bytes |
| Cold start | 30,603 ms, 886,194,176 RSS bytes |
| Warm start | 30,040 ms, 856,899,584 RSS bytes |

The baseline asset manifest has SHA256 `686ca6c158c516e2fa38fc2ac0edc797971222a53450ce087d1f9d6eed031`.

The process listened only on `127.0.0.1`. The sandbox denied external TCP and the fixture credential read. It allowed loopback TCP and writes inside its private root.

The candidate uses Node 26.5.1. The upstream CI uses Node 22, so the Node version remains a verification gap.

## Source findings

The stock frontend does not export an editor SDK. The full editor is a route-level application with its own layout, stores, toolbar, save hooks, API clients, and settings.

The toolbar registers keyboard shortcuts for Playground, API access, and export. A hidden toolbar does not remove these actions.

The Share menu exposes API access, export, MCP, embed, and a public Playground switch. The fork must remove these paths from the entry point.

The stock save path sends a PATCH without `expectedVersion`. Its client queue prevents local overlap, but it cannot prevent an unseen write from another tab.

The upstream canvas has keyboard support for connections and node movement. The retained tests use Enter on typed handles and arrow keys on selected nodes.

The stock inspector renders fields from component templates. The Trellis fork needs an installed manifest with only the seven accepted component types.

## Exact source evidence

| Concern | Pinned file | Blob |
| --- | --- | --- |
| Toolbar shortcuts | `src/components/core/flowToolbarComponent/index.tsx` | `fd7b50eb49cb7c44ba16bb522a8d707f2f8e1e37` |
| Playground action | `src/components/core/flowToolbarComponent/components/playground-button.tsx` | `32cb0aad320441c339697c956c530aecae54a5a8` |
| Share and export actions | `src/components/core/flowToolbarComponent/components/deploy-dropdown.tsx` | `ec24fdd5e4b4fbd2f22df8191f60b42ff970e7c5` |
| Route-level editor | `src/pages/FlowPage/index.tsx` | `52c2ade619e09edd8019083c4884c63fe1357ae9` |
| Save path | `src/hooks/flows/use-save-flow.ts` | `231366cfdd50ce6b4df50909ab15203a02c6f64b` |
| Autosave queue | `src/hooks/flows/use-autosave-flow.ts` | `7e0f2d8fca58ee9978311bb6f4455781f207121f` |
| Flow PATCH | `src/controllers/API/queries/flows/use-patch-update-flow.ts` | `677e72de3eaa33c617658a7ce8440cfa20fce287` |
| Keyboard canvas test | `tests/extended/features/canvas-keyboard-a11y.spec.ts` | `9540f806ea8f120d84f2950c07cb3d7d2ab4be12` |
| Inspector field rows | `src/pages/FlowPage/components/InspectionPanel/components/InspectionPanelParameterRow.tsx` | `4d84cb2fe40c53cfc76e69daadbdbf5155ed3d0b` |

## Cost estimate

The full-editor fork needs four source seams. The estimate covers 23 to 39 frontend files.

| Seam | Estimated files |
| --- | ---: |
| Mount and route shell | 3 to 5 |
| Toolbar and shortcut removal | 4 to 6 |
| Grant and save adapter | 5 to 8 |
| Catalog and typed inspectors | 5 to 10 |
| Focused tests | 6 to 10 |

This count is a source estimate. It is not a measured effort estimate.

An upstream update must repeat the four-seam audit. The toolbar and save hooks have direct product coupling, so an automatic upstream update is unsafe.

The separate editor needs an estimated 6 to 12 integration files. It retains the full Langflow navigation and splits the workspace between two applications.

## Source fixture checks

The source fixture checks reused dependencies from the canonical checkout. Both lock files then had SHA256 `ceeb63317e0c76a91eebea2e94615bca1e4b18c32f4c73cb80bdb73d393229ce`.

`Bun.resolveSync` resolved `@trellis/api` to this worktree at `packages/api/src/index.ts`. It resolved Zod to the canonical matching dependency.

| Command | Result |
| --- | --- |
| `bun test integrations/langflow/editor-probe/src/editorBoundary.test.ts integrations/langflow/editor-probe/src/gatewayProtocol.test.ts` | 30 pass, 0 fail, 103 assertions |
| `bun x --no-install tsc --noEmit -p integrations/langflow/editor-probe/tsconfig.json` | Exit 0 |
| `bun x --no-install @biomejs/biome check integrations/langflow/editor-probe/src` | 13 files checked, no errors |

These results predate the final flow-list and node-identity source fixes. Navid deferred the repeated checks until the complete Langflow merge.

The pinned frontend baseline type check reports 253 diagnostics in 87 files. The rejected probe patch added no diagnostic key, location, or message.

The comparison artifact has SHA256 `d93ad00e386eec4f3f0fd292e6bc9637f711d97ea22dc9b0bb35b4022910de16`.

The current patch has SHA256 `ec23fcc90f8e9799c323716a453ca52f5b4438cf3d0734b3908e1291c179d5d1`. Its source manifest has SHA256 `381f1647550d114ea418a3780df8e6dc7f85e306973d65862afc6d5bbd16fa84`.

Pinned Biome 2.1.1 accepted all nine files in the predecessor patch. The Langflow repository root also accepted that predecessor patch.

The final patch adds the flow-list initialization from source review. Its `git apply --numstat` command and pinned-source apply check exit 0.

The gateway binds the submitted component manifest hash to the pinned hash. It rejects changes to component definitions under allowed type names. The HTTP write route accepts only the full Langflow graph shape. The schematic helper remains limited to source fixtures.

The prior editor patch has SHA256 `a5f94d6e207b98be2a2a44e1e26b4d8d25f6b327108ebe8817ca639224941ab2`. The prior gateway source manifest has SHA256 `57852bd56f93a89b8bae795bd827ab3bd68d81b5c1d61744cb9dd027942d3a81`. The prior HTTP fixture manifest has SHA256 `17f4b2a0959b4a2a0b4190412870a4ced724b512a40a371deaaebd824bf73ca6`. TRL-667 retains those bytes in the `editor-a5f94d6e-snapshot` evidence directory.

The PR598 gateway source manifest has SHA256 `3834f3e4f7d80f5441c938e766acff329a089e74737e2919435f4131c987d822`. Its HTTP fixture manifest has SHA256 `10e1ac781250c6bd107457af9fef1ab4f403bfea1d4bdc2ca9a60c6b8f75cc94`.

The current worktree, canonical checkout, and merged editor repair contain the same lock file, with SHA256 `bff164db008eb9d1143f74f510c83ab5a40787b19726052eaa998758a5c3b87d`. The gateway manifest records this hash. `shasum -a 256 -c integrations/langflow/editor-probe/manifests/gateway-source.sha256` accepts all 14 records. This metadata check does not verify installed dependencies or runtime behavior.

TRL-667 built the repaired editor in 27.11 seconds with 3.577 GB peak RSS. Its build manifest has SHA256 `0fac70e2c411ad288be1161a03b7062bcf78633c93b7ad8d4381f95cac880748`. Nine-file Biome passed. The frontend type check produced bytes identical to the upstream baseline.

The first HTTP fixture passed the denial checks, then failed its lost-response assertion. One client call produced an accepted write and an immediate replay. The gateway now sends response headers and an incomplete body before disconnect. The client consumes that body before it records a transport failure. The corrected transport requires a repeated HTTP check.

The first Aside load displayed a blank page. Its DOM contained an empty `#root`. The browser ignored `<base href="/">` because the gateway policy used `base-uri 'none'`. Relative asset requests used the nested flow path. The corrected gateway permits only a same-origin base URL. The actual graph render and interactions remain unverified.

The PR598 HTTP fixture also failed its lost-response assertion. Its evidence records an accepted save and an immediate replay from one client call. The current injector delays the disconnect by 100 milliseconds after the partial write. This delay belongs only to the fault fixture. Its transport effect remains unverified.

The next Aside load reached the Langflow sign-in error. The server log records an `ENOENT` error for `built-assets/health_check`, followed by process exit. The current gateway handles `/health_check` as a protected route and returns 404 for missing assets. Its session response supplies a fixture user after the grant check, without an access token. The focused fixtures cover session denial, grant expiry, and process survival after a missing asset. The four changed TypeScript files pass Biome. The new source and HTTP fixtures await the shared execution batch.

The PR642 batch passed 31 tests with 119 assertions and the focused TypeScript check. Biome passed with five unused-suppression warnings. Its HTTP check still recorded an automatic replay before the lost-response assertion.

Bun 1.3.13 sets `allow_retry` when it reuses a pooled connection. Its close handler then resends the original request. The scripted HTTP client uses `keepalive: false` to select a fresh connection. It checks for one accepted write before its explicit retry. This client setting does not change the editor or prove browser behavior. Sources: [connection reuse](https://github.com/oven-sh/bun/blob/bun-v1.3.13/src/http/HTTPContext.zig#L630-L689), [close handler](https://github.com/oven-sh/bun/blob/bun-v1.3.13/src/http.zig#L270-L275), and [fetch option](https://github.com/oven-sh/bun/blob/bun-v1.3.13/src/bun.js/webcore/fetch.zig#L577-L602).

The first test attempt stopped before tests because the worktree had no Zod package. The approved local links fixed the dependency gap without an install.

## Mounting decision

### Full editor inside Trellis

Keep the current Trellis `/ai/flows/<slug>` route and topbar. Mount a pinned fork on an isolated editor origin inside the remaining workspace.

The fork uses a custom entry point. It omits the Langflow app header, Playground, Share, deploy, API, MCP, import, export, Python, provider, and global-secret surfaces.

Trellis creates an HttpOnly editor session. The session binds the actor, host, flow, project, revision, three allowed operations, and expiry.

The editor calls only three restricted routes: document read, component manifest read, and compare-and-set document save. The browser sends no Trellis bearer token, Langflow key, or provider key.

The save gateway validates the grant and the public V1 document. It also validates the installed component manifest before it writes.

The parent and editor can exchange display messages for height, focus return, and selection. A browser message never authorizes a save, run, decision, or component change.

This mount preserves one Trellis workspace and one save owner. It needs a maintained fork across the four source seams.

## Required candidate proof

1. Apply the repaired probe patch in the existing TRL-667 candidate.
2. Run the focused source checks against the patched candidate.
3. Start one bounded local editor with no provider credentials.
4. Use Aside for desktop, 320-pixel, keyboard, focus, scroll, and network proof.
5. Attempt each denied route directly and record the server response.
6. Prove the save, retry, newer draft, second save, and version conflict sequence.

## Open gaps

- The desktop sequence and narrow dialog checks pass. Dense navigation remains open.
- The 320-pixel canvas fits at 0.25 scale, with tiny controls and overlapping cards. This does not pass narrow usability.
- The retained gateway evidence reports no forbidden secret on saves. A complete browser request audit remains open.
- Stock run controls remain visible. The gateway denies their requests. Stock workflow and variable requests also remain active.
- The seven-node fixture cards overlap. Canonical Trellis controls and selectors remain with the production adapter.

## Actual editor batch, September 29

The PR648 HTTP fixture passed with `lostResponseObserved: true`, replay revision 3, later revision 4, and 40 evidence events. Its manifests and focused TypeScript check passed. TRL-667 retained the result under `runs/editor-ab6f56dd` in the sole candidate.

Aside loaded the retained compiled editor at a measured 1440-by-900-pixel viewport. All seven component types rendered. An instruction edit and Save produced revisions 3 and 4.

After an injected lost response, the toolbar showed Retry save. A newer local draft remained unsaved until the explicit Retry. The gateway replayed the original identity and byte hash at revision 5, then accepted the newer draft at revision 6. The repeated request used ID `33abd09e-703c-4615-84e8-c23470f8ab30` and SHA256 `f27cc683d89fc2ecdf51626874ab9203eba44a00104197238920901496aa256b`.

Enter on the Agent output and Native gate question created a typed edge. The gateway saved that edge at revision 7. After an injected conflict, the toolbar showed disabled Reload required. A later instruction edit sent no new PUT. Escape closed the expanded text editor and returned focus to its Expand text editor button.

The Run component action received HTTP 403 from the workflow route. The browser also attempted external font and Discord requests, with zero transfer size and duration in its resource entries. The gateway CSP permits only same-origin connections. These observations do not establish production isolation.

TRL-672 attachments retain the screenshots and `editor-desktop-proof.json`. TRL-667 owns `browser-evidence.json` and the server log for this batch. The browser tab is closed and its listener is released for cleanup.

## Actual narrow editor batch, September 29

PR653 passes 36 tests with 132 assertions, focused TypeScript, and both source manifests. Biome passes with six unused-suppression warnings. The default HTTP batch passes the lost-response sequence with replay revision 3 and later revision 4.

Aside measured the real editor iframe at 320 by 800 pixels. The document and body both report a scroll width of 320 pixels. The Save flow button fits within the viewport and has a height of 44 pixels.

The instruction dialog measures 320 by 760 pixels. Finish Editing preserves the entered instruction and returns focus to Expand text editor. The gateway accepts the instruction at revisions 3 and 4. Both save events report `forbiddenSecret: null`.

The initial canvas uses 0.25 zoom. Its cards overlap and its fields become too small for normal use. The narrow result proves the viewport, dialog, save, and focus behavior, but not usable canvas navigation. Aside reports a navigation readiness timeout; the subsequent snapshot and screenshot show the loaded editor.

TRL-672 retains `editor-narrow-initial.png`, `editor-narrow-dialog.png`, and `editor-narrow-proof.json`. The browser tab is closed. TRL-667 receives the release of PID 15567 before the dense case starts.

## Required-density attempt, September 29

TRL-667 served the 500-node, 2000-edge, 50-round case with the same compiled assets. The gateway recorded HTTP 200 for the flow read and retained revision 2. Aside opened the tab, but two scoped snapshots timed out in `Runtime.evaluate`. A screenshot also timed out. These results do not prove a usable graph or navigation.

The first close request timed out in `Aside.controlTab`. A later close reported success, but the browser tab list still contained the same target. Browser cleanup remains unconfirmed. TRL-667 received the release of gateway PID 24124 and a request to hold the larger case. The dense acceptance gate remains open.

## Narrow and dense repair, TRL-831

The repaired patch uses the saved viewport and exposes the existing Langflow zoom control. It disables automatic fit only in probe mode. The fixture rows use 800-pixel spacing. The dense graph keeps its identities, fields, edges, and viewport.

The canvas projection supplies initial dimensions and empty handle metadata for unmeasured nodes. ReactFlow measures visible cards and draws edges when both endpoint measurements exist. The save hook reads the complete graph from the flow store. The save and Retry implementation stays unchanged.

The read-only apply check passes against the pinned frontend source. Biome processes all ten patched frontend files through standard input. The candidate source stays unchanged.

The focused batch passes 40 tests and 11,195 assertions. The probe TypeScript check passes. Biome passes on the probe source and visibility script. An initial attempt lacked the local runtime-protocol link and exposed strict test typing errors. The final batch includes those corrections.

`frontend/canvasVisibility.ts` calls the pinned ReactFlow functions without a browser or server. At a 1440-by-900 viewport and 0.75 zoom, both dense cases select 12 visible nodes instead of every node. The lookup retains all 500 or 501 nodes. A 320-pixel viewport can reach the final node after a viewport change. These function checks do not establish mounted performance, keyboard behavior, or focus.

Commands:

```sh
git -C "$LANGFLOW_SOURCE" apply --check --directory=src/frontend "$TRL_EDITOR_PATCH"
nice -n 10 bun test integrations/langflow/editor-probe/src/{canvasProjection,editorBoundary,gatewayProtocol,probeGraph}.test.ts
nice -n 10 node_modules/.bin/tsc --noEmit -p integrations/langflow/editor-probe/tsconfig.json
nice -n 10 node_modules/.bin/biome check integrations/langflow/editor-probe/src integrations/langflow/editor-probe/frontend/canvasVisibility.ts
nice -n 10 bun integrations/langflow/editor-probe/frontend/canvasVisibility.ts "$LANGFLOW_SOURCE/src/frontend"
```

The next candidate batch must compile the repaired patch and repeat the actual desktop, narrow, and dense interactions. Later-round receipts and progress preservation still require the run-view and engine evidence.
