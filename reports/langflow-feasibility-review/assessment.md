# Feasibility assessment

Assessment date: 29 September 2026. Owner: TRL-674.

The replacement does not pass feasibility. Langflow activation remains blocked.
Independent source checkpoints may proceed from stable contracts under Navid's delivery delegation.
This gate does not block a Trellis-only release of unrelated fixes.
The merged source contains useful contracts and fixtures, but it does not establish all required engine behavior.
TRL-674 remains In Progress. A source merge does not complete a feasibility parent.

## Reviewed source and authority

The source batch ends at `1753c14fcf5ae2a71d99c300574a79ee7e219895`.
The first source inspection uses `79004c939030861009f709986cd8ec2f18dc83f3`.
Principal reports ten forced type checks with no cached tasks at that commit.
That report does not establish Python, browser, or installed behavior.

Langflow remains pinned to `fec71dca901949c09ed4d63315804337cd2eb13d`, tree `e6ac634257b30645b6c35bcc707ed271789877d6`.
`integrations/langflow/patches/series.json` specifies backend first, then editor under `src/frontend`.
The backend patch digest is `4bd0ce89e7e843114426b06c16a9d231797aeee6e56fec04323d4b2da902c4c0`.
The editor patch digest is `4006793d90fdae7e16e1fc6e6a97ed1c155c75a64ce851662a4a48a203375fc9`.
These identify the rejected first batch, not an accepted release.
The assessment now includes repaired source through `523572708`; it does not apply those repairs to the reported first-batch results.

TRL-667 owns the existing candidate, patch application, private probe inputs, and restoration.
Source owners retain their fragments. TRL-674 owns backend composition and this assessment.
TRL-672 may update the editor digest in the series with its patch repair.
Principal retains the canonical checkout and production release. No Langflow installation is authorized.

## Initial source assessment

The backend assembly changes twelve upstream files. Its manifest assigns each change to TRL-668, TRL-669, or TRL-670.
The shared `jobs/service.py` contains admission and continuation operations from two owners.
The manifest records one shared import and corrected hunk offsets.
The fragment digests match the committed inputs when checked with `shasum -a 256`.

The inspected extension stores correlation, decision receipts, external waits, and continuation obligations inside Langflow.
The graph checkpoint retains external waits. The background service uses the existing Langflow executor.
These changes do not establish a second Trellis successor selector.
They also do not establish correct joins, branches, loops, or concurrent recovery.
Acceptance requires the corresponding engine traces.

The following findings describe the initial batch. The repair section below records later source changes.

| Finding | Evidence | Required action | Owner |
| --- | --- | --- | --- |
| Editor patch cannot parse | `git apply --numstat integrations/langflow/editor-probe/patches/trellis-editor-probe.patch` reports `corrupt patch at line 439`. | Repair hunk syntax and verify application against the pin. Update the series digest. | TRL-672 |
| Admission path lacks `cast` import | Backend patch lines 845-851 call `cast`. Its jobs-service import hunk retains only `TYPE_CHECKING`. | Add the runtime import, then exercise pending admission obligations. | TRL-668 |
| Decision schema lacks migration coverage | `decisions.log` reports an Alembic model/database mismatch for both decision tables. | Add the shared decision and correlation migration chain. Keep test-only tables outside that chain. | TRL-670; TRL-668 owns its fixture import boundary |
| Date arithmetic does not prove engine deadlines | `test_semantic_limits_and_deadlines.py:55` adds a duration to three fixture dates without an engine call. | Exercise nested groups and loops through launch, restart, and deadline warnings. | TRL-669 |
| Native clock fixture uses the legacy scheduler | `nativeLifecycleFixture.ts` imports `claimNext` and `prepareFlowReconcile`. | Retain this as native baseline evidence. Compare the Langflow execution trace separately. | TRL-671 and TRL-669 |

Paths in this table resolve under `integrations/langflow/`, except the backend patch under this report directory.
The decision log resides under the existing candidate at `runs/integrated-1753c14f/decisions.log`.

## Required engineering probes

Pass means the complete acceptance condition has retained, reviewed evidence.
Incomplete means the current result cannot satisfy that condition, even when focused assertions pass.
Fail means a retained command or observation contradicts a required condition.

| Probe | Result | Current evidence and missing proof | Owner |
| --- | --- | --- | --- |
| ENG-F1: permanent submission | Incomplete | Eleven correlation tests pass. Five SQLite setup errors prevent the real transaction and crash bodies. | TRL-668 |
| ENG-F2: concurrent roots and waits | Incomplete | Queue-claim fixtures do not cover every independent-root checkpoint crash window. | TRL-669 |
| ENG-F3: completion authority | Incomplete | Equal replay uses an in-memory job store. Stale, forged, delayed, and reordered deliveries need integrated traces. | TRL-669, TRL-671 |
| ENG-F4: native crash recovery | Incomplete | Retained fixture traces cover writer SIGKILL and disk reopen, but not installed-runtime recovery. | TRL-671 |
| ENG-F5: engine worker loss | Incomplete | The patch adds recovery paths. Full human/native wait recovery and retained stop obligations need proof. | TRL-669, TRL-671 |
| ENG-F6: groups, loops, deadlines | Incomplete | Date arithmetic and legacy native clocks do not prove Langflow nested execution or warning parity. | TRL-669, TRL-671 |
| ENG-F7: cancellation | Incomplete | Native stop failure, exit 143, and late-result isolation pass. Cancellation-writer death and Langflow cascade remain open. | TRL-671, TRL-669 |
| ENG-F8: Review v71 parity | Incomplete | No retained exact Review v71 engine trace or complete synthetic join/NO/loop trace supports acceptance. | TRL-669 |
| ENG-F20: human acceptance | Fail | Eleven tests pass. One PostgreSQL case skips. SQLite setup fails before the continuation test body. | TRL-670, TRL-669 |
| ENG-F21: ownership transfer | Incomplete | Same-process CAS and durable-store reopen pass. An OS-killed owner and production supervisor remain unproved. | TRL-671 |
| ENG-F22: admission barrier | Incomplete | The import repair merges, but SQLite setup prevents the real submission-race bodies. | TRL-668 |

The decision command reports `11 passed, 1 skipped, 2 warnings, 1 error in 29.40s`.
The error names `test_accepted_decision_survives_every_service_fault_and_runs_one_successor[sqlite]`.
The test body never runs. Its presence in the suite does not establish continuation recovery.

## Integrated batch and repair results

The package group passes thirteen Bun tests and three Python verifier tests.
Focused type checks and Biome pass. Complete filesystem isolation still fails; no Linux target passes.

The native group passes seven tests and 125 assertions in 36.10 seconds.
Attachment `01M3Q30E7Z27F27R61WG165TJY` retains the original final output chunk, including all process and cleanup records.
Its SHA256 is `7401af4cfe8c8602e544e6716db37139e8a9ae9151295f6b17bfcb7f4f76c1b3`.
The retained chunk omits initial progress lines. No rerun is necessary to recover its structured evidence.

ENG-F4 covers real writer SIGKILL before and after reservation, launch record, prompt record, and result persistence.
The fixture reopens disk state, retains the original native PID, and prevents a replacement claim after an unknown launch.
It uses a fixture HarnessHost and deterministic child, not the installed runtime.
ENG-F7 covers an injected stop failure, real exit 143, and canceled-result isolation.
It does not cover a killed cancellation writer or a Langflow stop cascade.
ENG-F21 covers same-process competing CAS requests and durable-store reopen, not an OS-killed owner or a production supervisor.
ENG-F6 proves the existing Trellis scheduler clocks only. These limits keep the complete probe requirements open.

The semantic group reports nine passes, two failures, and three PostgreSQL skips in 7.09 seconds.
The failures concern an undefined human-decision graph field and assignment to a read-only component property.
PR 586 repairs those source paths. No repaired result exists at this assessment checkpoint.
The group does not establish the full Review v71, join, branch, nested-loop, independent-wait, or group-deadline requirements.

The correlation group reports eleven passes, five PostgreSQL skips, and five SQLite setup errors.
The startup check finds no migration for `trellis_job_correlations`.
A test-only native-admission table also enters SQLModel metadata before setup.
No real transaction or crash test reaches its body.
TRL-670 owns the shared correlation and decision migration chain. TRL-668 owns the fixture import boundary.

PR 584 repairs the admission import. PR 585 repairs the editor patch syntax.
The repaired editor digest is `ec23fcc90f8e9799c323716a453ca52f5b4438cf3d0734b3908e1291c179d5d1`.
The editor owner reports successful parsing and read-only application checks against the pinned source.
PR 587 isolates decision fixture imports. This fixture repair does not supply production migration coverage.
TRL-674 must include the admission repair and shared migrations in the final backend assembly before combined verification.

| Repair | Merged source | Evidence status |
| --- | --- | --- |
| PR 583: native deadline fixture | `416e53d3c0c5d0bf6898fb25e43fb041156f0413` | Corrected native suite passes within the limits above. |
| PR 584: admission import | `78db95016a805b0df4b935b8b29a3bfd7f5a60d4` | Fragment source inspected; combined backend update pending. |
| PR 585: editor syntax | `ea605f26b101bc723bf985a953ee6287a7e2fd11` | Owner reports successful parse and pinned apply check; browser proof pending. |
| PR 586: human bridge | `efc0f072375684348e1599ef03502c988dc6c547` | Source inspected; repaired semantic result pending. |
| PR 587: decision fixture imports | `523572708` | Source inspected; real startup migration coverage remains open. |

TRL-667 reports complete restoration after the first backend batch.
The source tree, empty tracked/untracked status, lockfile, and Python inventory match the initial baseline.
`runs/integrated-1753c14f/restoration.log` retains that check.

## Critique preservation

| Finding | Required closure | Current disposition |
| --- | --- | --- |
| ENG-B1 | Durable decision acceptance and recoverable continuation | ENG-F20 fails setup; remains open. |
| ENG-B2 | One current engine owner with immutable native provenance | ENG-F21 remains incomplete. |
| ENG-B3 | No effect before durable admission | ENG-F1 and ENG-F22 remain incomplete. |
| ENG-B4 | Deadlines from observed launch time | ENG-F6 needs the Langflow trace. |
| UI-F1 | Actual type-specific forms and field behavior | Source and schematic coverage only. |
| UI-F2 | Exact occurrence, attempt, and historical identities | Actual editor and run-view proof remains open. |
| UI-F3 | Saved revision and executable publication stay distinct | Actual publication-state proof remains open. |
| UI-F4 | Recorded, pending, unknown, and confirmed decisions stay distinct | Actual receipts and rendered transitions remain open. |
| UI-F5 | Usable narrow dialog, focus return, zoom, and keyboard | Prior schematic result does not cover the actual editor. |
| UI-F6 | Dense graph and repeated-round navigation | Dense fixtures exist. Rendered and live-engine results remain open. |

## Decisions D1-D20

The delivery delegation permits routine engineering decisions. It does not supply missing human acceptance or platform proof.

| Decision | Disposition |
| --- | --- |
| D1: maintained backend patch | Human acceptance remains open after the technical assessment. Current source does not pass feasibility. |
| D2: editor mount | Navid selects the full Langflow editor inside the Trellis workspace. Note `01M3Q242R632TB5G9CSYVX909R` records the choice. |
| D3: save concurrency | Keep the public V1 `expectedVersion` and request-identity contract. |
| D4: format compatibility | Keep versioned endpoints and explicit unsupported legacy writes. |
| D5: component catalog | Permit installed, hashed components only. Security and isolation proof remains open. |
| D6: durable external execution | Keep the bounded Langflow wait extension. Require all engine probes before acceptance. |
| D7: repeat authorization | Preserve current eligibility and repeat rules. |
| D8: cross-head review credit | Preserve applicable successes and waivers across later heads. |
| D9: worktree and prompt context | Preserve configured source and current launch context. |
| D10: historical deletion | Preserve current cascade behavior. No stronger retention promise. |
| D11: missing history | Preserve available bytes and explicit missing-data diagnostics. |
| D12: runtime and isolation | The delegated choice selects Linux OCI arm64 on existing local Docker first, then Linux OCI x86_64 in existing hosted CI. Keep CPython 3.12.12 and the immutable source/lock. Both targets remain unproved. The direct macOS Python candidate fails full filesystem isolation and is not an accepted boundary. |
| D13: event retention | Event cursor lifetime and storage budget remain open. Token streams stay outside milestone retention. |
| D14: Review prompts | Preserve Review v71 instructions and independent roots. |
| D15: client scope | Preserve desktop and narrow web. Native-mobile addition remains unapproved. The named external-client inventory remains open. |
| D16: cutover and rollback | Principal selects the release window after restore proof. Drain existing legacy runs and unresolved stops. |
| D17: decision ledger | Preserve atomic acceptance, resume signal, obligation, and exact lookup. Require ENG-F20 proof. |
| D18: engine authority | Preserve compare-and-set transfer and immutable launch provenance. Require ENG-F21 proof. |
| D19: admission | Keep admission closed until exact binding. Require ENG-F22 proof. |
| D20: arbitrary limits | Remove arbitrary ceilings. TRL-710 owns legacy limits; TRL-711 owns draft transfer. Dense cases define fixtures only. |

TRL-674 accepts the proposed measurement targets as engineering acceptance criteria under the delivery delegation.
Selection-to-inspector p95 must not exceed 150 ms. Search p95 must not exceed 250 ms.
Cached graph or run access must become usable within two seconds.
Use five warmups followed by thirty interactions for each measurement and density case.
Retain durations, host, build, viewport, theme, zoom, and cache state.
No performance result passes yet. A rendered-row budget still needs measured visible rows and overscan from TRL-673.

## D12 proof target

The delegated implementation choice on 29 September selects Linux OCI for the next isolation proof.
TRL-667 owns that proof. The selection does not authorize production activation or establish platform acceptance.
The coordinator reports local Docker as Linux/aarch64 with sixteen CPUs and 16,818,663,424 bytes of memory.
That report describes available capacity, not an isolation result.

Use an unprivileged container with read-only runtime and source files.
Provide explicit private writable data for the sidecar.
Do not mount a host home, repository, credentials, or the Docker socket.
Use an authenticated private endpoint and deny external egress outside the container.
Prove actual restrictions and retained data after restart. Environment-variable removal does not prove isolation.

Reuse available images and cache. Measure disk before a necessary target build.
Preserve the existing candidate and other owners' resources.
Do not install another host runtime or create cloud resources.
After the arm64 proof, use the existing hosted CI for Linux OCI x86_64.
Neither target has retained proof at this decision checkpoint.

## Next work and gate

Source owners complete the engine migrations and fixture boundaries through linked follow-ups.
The editor syntax, admission import, and human-bridge source repairs already merge.
TRL-674 updates the backend composition after those source handoffs.
TRL-667 runs the combined probes after the repair batch and retains exact input hashes and restoration evidence.
TRL-669 supplies real-engine coverage for the remaining semantic gaps.
The editor owners then use the existing candidate for HTTP, browser, and dense-graph proof.

Production tickets retain their dependency on TRL-674.
Source checkpoints TRL-782, TRL-783, TRL-784, and TRL-785 prepare documents, CLI compatibility, discovery, and drafts respectively.
All four assigned workers report running. Their parents retain runtime and rendered acceptance requirements.
These checkpoints do not activate the replacement or register unimplemented handlers.
Principal retains migration 0132 and the production release. TRL-782 does not generate a migration.
The gate passes only after required probes, independent trace review, and required architecture decisions pass.
No failed or skipped probe counts as acceptance.
