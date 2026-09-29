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

The corrected gateway source manifest has SHA256 `3834f3e4f7d80f5441c938e766acff329a089e74737e2919435f4131c987d822`. The corrected HTTP fixture manifest has SHA256 `10e1ac781250c6bd107457af9fef1ab4f403bfea1d4bdc2ca9a60c6b8f75cc94`.

The current worktree, canonical checkout, and merged editor repair contain the same lock file, with SHA256 `bff164db008eb9d1143f74f510c83ab5a40787b19726052eaa998758a5c3b87d`. The gateway manifest records this hash. `shasum -a 256 -c integrations/langflow/editor-probe/manifests/gateway-source.sha256` accepts all 14 records. This metadata check does not verify installed dependencies or runtime behavior.

TRL-667 built the repaired editor in 27.11 seconds with 3.577 GB peak RSS. Its build manifest has SHA256 `0fac70e2c411ad288be1161a03b7062bcf78633c93b7ad8d4381f95cac880748`. Nine-file Biome passed. The frontend type check produced bytes identical to the upstream baseline.

The first HTTP fixture passed the denial checks, then failed its lost-response assertion. One client call produced an accepted write and an immediate replay. The gateway now sends response headers and an incomplete body before disconnect. The client consumes that body before it records a transport failure. The corrected transport requires a repeated HTTP check.

The first Aside load displayed a blank page. Its DOM contained an empty `#root`. The browser ignored `<base href="/">` because the gateway policy used `base-uri 'none'`. Relative asset requests used the nested flow path. The corrected gateway permits only a same-origin base URL. The actual graph render and interactions remain unverified.

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

- The corrected fork patch has not passed an integrated build. Verification waits for the complete Langflow merge.
- No browser state has rendered.
- No network trace proves secret-free requests.
- No actual HTTP route proof exists for the server denials.
- No actual editor test proves the save and explicit Retry sequence.
- The focused source fixtures pass. The patched editor remains unmeasured.
