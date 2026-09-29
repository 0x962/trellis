# Early backend composition

This record covers source integration for the admission and human decision paths in TRL-668, TRL-669, and TRL-670.
The authorization is project note `01M3P15JD33MFEB34YJJZ4G1D0`.
The final TRL-674 review, human decisions, and production gate remain open requirements.


## Current source integration requirement

Navid directs the authors to integrate source without serial probe slots.
Tests run after all changes merge.
No tests, builds, probes, installs, or new checkouts run during this source phase.
The authors continue in their existing workspaces and conversations.
The historical `ce71d7da` fragment and `23ec0871` assembly contain a rejected recovery path.
Their earlier source checks do not establish acceptance.

TRL-668 keeps admission obligations pending after the admission transaction.
TRL-670 keeps human obligations pending after acceptance.
TRL-669 owns the common dispatch result, startup drain, lease-expiry retry, and proof before the final mark.
The final mark receives the immutable continuation receipt bytes and exact obligation identities.
The confirmed human mark signature is:

```python
async def mark_enqueue_obligation_consumed(
    self,
    *,
    engine_job_id: UUID,
    engine_request_id: str,
    decision_id: str,
    signal_id: UUID,
    enqueue_obligation_id: UUID,
    continuation_receipt_bytes: bytes,
) -> None:
```

The ledger locks the acceptance and obligation in one session.
It verifies each identity and the exact stored continuation receipt.
Equal replay succeeds; changed identity or receipt bytes conflict.
The admission mark uses the corresponding fields without a human decision identifier.

A queued job, lease, or continuation receipt alone does not prove execution.

The agreed source interface is:

```python
DispatchDisposition = Literal["dispatched", "execution_proven", "pending_lease", "cancelled"]

_enqueue_queued_continuation(
    *, engine_job_id, enqueue_obligation_id, continuation_receipt_bytes: bytes
)
```

A `pending_lease` result leaves the obligation pending and schedules one service-owned retry at lease expiry.
Both consumers mark only after dispatch or durable proof of prior execution.
Cancellation remains explicit and leaves the obligation unmarked.
The service cancels and awaits its retry tasks when it stops.
Langflow retains the sole graph scheduler and queue path.

TRL-668 owns `AdmissionEnqueueObligation`, `pending_trellis_admission_obligations`, and `mark_trellis_admission_obligation_consumed`.
The obligation includes `engine_job_id`, `engine_request_id`, `signal_id`, `enqueue_obligation_id`, and `continuation_receipt_bytes`.
The authors agree that both continuation helpers return `bytes | None`.
The bytes retain the original UTF-8 representation of `JobCheckpoint.blob`.
The corrected immutable source hashes appear in the completed assembly record below.
Runtime proof and production approval remain unverified.

## Source identities

| Input | Identity |
| --- | --- |
| Langflow release | v1.12.3 |
| Langflow commit | `fec71dca901949c09ed4d63315804337cd2eb13d` |
| Langflow tree | `e6ac634257b30645b6c35bcc707ed271789877d6` |
| Trellis internal contracts | `6246fcca805f6e5390f26b7924e28f27f7de0409` |

The contract fixtures are unchanged from `678f245448b523c8f7a9727d013dedfe2f6c280c`.
The published human checkpoint uses `human-wait-1` as its wait key and `human-request-1` as its decision request key.
The combined probes retain both values.

## Ownership

| Source or result | Owner |
| --- | --- |
| Permanent correlation, submission, and admission receipt writes | TRL-668 |
| Graph checkpoint, wait set, continuation receipt, and queue writer | TRL-669 |
| Human acceptance ledger and its four public methods | TRL-670 |
| Human service caller, post-commit queue dispatch, and recovery drain | TRL-669, through the explicit TRL-670 handoff |
| Shared-file patch composition and this record | Backend coordinator in session `01M3NXPX04Q6TB7Q1DTAMSHBYV` |
| Candidate apply, execution, reversal, and baseline checks | TRL-667 |
| Final patch series and independent architecture review | TRL-674 |

Fragment authors retain their source and tests.
The coordinator prepares shared-file hunks without edits to another author's fragment.
Langflow retains graph transitions, branches, joins, and loop rounds.

## Transaction boundaries

The admission contract requires one engine transaction for the receipt and durable continuation obligation.
TRL-669 owns the required caller-transaction helper for the single queue writer.
Its historical `ce71d7da` snapshot exports the helper with a text return value.
The corrected contract below uses bytes in the completed replacement source assembly.
The earlier `85cc59be` result does not cover that helper.
The contract places executor dispatch after the commit.

The acknowledged interface is:

```python
async def consume_suspended_continuation_in_session(
    self,
    session: AsyncSession,
    *,
    engine_job_id: UUID,
    engine_request_id: str,
    decision_id: str | None,
    signal_id: UUID,
    enqueue_obligation_id: UUID,
) -> bytes | None:
```

The caller writes or confirms the exact receipt, resume signal, and enqueue obligation in its active session.
The helper flushes that session and validates the saved job, signal, wait, request, decision, and obligation identities.
It owns the conditional `SUSPENDED` to `QUEUED` update and the immutable `trellis-continuation-v1:<enqueueObligationId>` receipt.
Equal replay returns the exact stored JSON bytes.
The corrected helper converts stored text to UTF-8 bytes without JSON serialization.
Changed identity raises `continuation_obligation_conflict` or `continuation_binding_conflict`.
An ineligible continuation returns `None`.
Commit, signal consumption, executor dispatch, and successor selection remain outside this helper.

TRL-670 exposes `accept`, `lookup`, `pending_enqueue_obligations`, and `mark_enqueue_obligation_consumed` on `DecisionAcceptanceLedger`.
`accept` commits the acceptance row, exact resume signal, and pending enqueue obligation in one engine transaction.
It returns the original acceptance receipt after the commit.
TRL-669 consumes that obligation after the commit and retains one immutable continuation receipt.
It marks the obligation consumed after the receipt and queue call return.
A crash before the mark leaves the same obligation available for recovery.

TRL-669 also owns `lookup_trellis_human_decision` on the background service.
The wrapper delegates to the TRL-670 ledger with exact execution, job, request, decision, and digest bindings.
The immutable `ce71d7da` snapshot contains this wrapper, the admission helper, human acceptance, recovery drain, and one queue path.
These historical bytes define the rejected recovery path described below.
The corrected source assembly must replace them.

## Immutable probe inputs

Each author supplies a patch snapshot whose filename contains its full SHA-256.
The author also supplies a fixture-file hash manifest and the exact fixture command.
Snapshots reside under the author's owned `TMPDIR` directory with a `trellis-` prefix.
An author never changes a snapshot after its handoff.
TRL-667 verifies and copies the snapshot, then uses its private bytes through reversal.
The author removes the owned snapshot only after TRL-667 releases it.

Each patch must pass a read-only apply check against the clean pinned source before a probe request.
The combined record must name the executed fragments, their hashes, their order, any shared-hunk changes, and the resulting patch digest.
The record must also retain the fixture hashes, command, result, and clean restoration proof.

## Required proof

The admission probe must demonstrate one permanent correlation and atomic receipt consumption after response loss and process crashes.
The human probe must call the real acceptance ledger and resume the real graph through one successor.
It must retain the published wait and request identities across acceptance, checkpoint, continuation, and recovery.
Source inspection, a manually inserted resume signal, and a method-return assertion do not establish that result.

## Recorded preliminary result

The TRL-669 snapshot `85cc59be1512c84a76e535df935947a3d4634793b439243f17ff2ee2aaf3c7f1` reported 5 passes, 2 failures, and 6 setup errors.
The external fixture command lacked the required upstream async pytest configuration.
TRL-667 restored the pinned source, lock files, and environment after this window.
This run does not pass the admission or human composition requirements.

The TRL-670 ledger-only snapshot `533ff7f1cd0e0add73a2546f09067fe097f80c4fd38c224e43b6175ffbb384b8` passes its clean-source apply preflight.
Its fixture manifest is `dd55ee73f247981645501bedc166cf5d0c6b4d78b2e1b59dde7338476f464ddb`.
The coordinator verified all six manifest-listed file hashes against the retained snapshot.
The fragment adds only `src/backend/base/langflow/services/trellis_v1/decisions.py`.
It has no shared-file hunk with TRL-669.
The focused ledger run reported 10 passes and one failure.
The stored receipt changed `recordedAt` from `.000Z` to `Z` on read.
The author must preserve the original serialized receipt before exact replay can pass.
The combined continuation result remains pending.

The authored continuation fixture calls the ledger, queue receipt method, and graph separately.
It manually marks the enqueue obligation and supplies the graph decision.
It does not exercise the service caller, executor dispatch, or startup drain.
A later fixture must cover that composed path and service-level replay after a lost response.

## Rejected preliminary admission composition

The combined patch is `early-admission.23ec0871323484f671df9ffc1c9a0bf6a4c00b1171b82314e545225f3050513b.patch`.
Its SHA-256 is `23ec0871323484f671df9ffc1c9a0bf6a4c00b1171b82314e545225f3050513b`.
The adjacent `early-admission-manifest.json` records the inputs, file hashes, and hunk offsets.

| Input | Patch SHA-256 | Fixture manifest SHA-256 |
| --- | --- | --- |
| TRL-668 | `4d43914d259b82c8880fd946ceb3ca44be52bd65dce607ffaa9cd073fdb442d7` | `b07e19e18b15c708dd8266898c7677adaf168b027cce66060ca0f2b39698e317` |
| TRL-669 | `ce71d7da1f409e1d8042e89678df6144ffbe7a5487492db8fc22a763e9f0e44e` | `c50d331982b7c08259b8a0bcecedd48988c6d72d74116433ce75c866100a211c` |

The coordinator verified the patch hashes and all five TRL-668 manifest files.
TRL-667 retains the TRL-669 patch after the author released its original snapshot.
TRL-667 must verify private copies of the TRL-669 fixtures before execution.

The patch combines eleven files from pinned preimages.
The shared `jobs/service.py` file contains both authors' methods and one `AsyncSession` import.
Sixteen original hunk headers required line offsets to match their exact pinned context.
The combined patch corrects those offsets and preserves the author source bytes, except for the duplicate import.
All eleven resulting Python files pass `ast.parse`.
The read-only `git apply --check` command passes against the shared pinned source.
The subsequent Git status, with all untracked files included, is empty.
These checks do not apply or execute the patch.

The TRL-668 table retains the actor/request primary key, a unique host/execution key, and a unique engine session.
It commits the job and correlation in one engine session.
Admission calls the TRL-669 helper in its active session before the commit.
The frozen fixture checks identity conflicts and equal receipt replay with real job services.
Its queue harness records dispatch before a manual runner call.
It does not establish process-crash recovery at every acceptance, binding, or admission boundary.
The author retains those proof requirements while this preliminary combined probe runs.

The TRL-669 startup drain imports `decisions.py` from TRL-670.
The eleven-file assembly does not contain that ledger.
Its first window therefore covers the job, admission, and runner methods only.
Full service startup and restart probes require the fixed immutable TRL-670 ledger fragment.
The fixture must retain the actual startup drain and its dependency.

`consume_decision_continuation` raises `continuation_not_pending` when the immutable receipt is absent.
It calls the queue method before it returns the parsed receipt.
`_consume_trellis_decision_obligation` marks the obligation only after that call returns.
The combined fixture must also prove correct duplicate suppression for queued and active jobs.

## Source finding for queued lease recovery

The `ce71d7da` service returns from `_enqueue_queued_continuation` when `claim_queued_lease` returns false.
The human consumer then marks the pending obligation consumed.
The combined patch contains these statements at lines 318 and 235.
A failed queue claim does not prove that an executor received the job.

The missing crash boundary lies after the queue lease commits and before `_enqueue` starts.
A restart before lease expiry skips dispatch in both the obligation drain and the startup queue sweep.
The pinned default asyncio service starts no periodic orphan sweep.
Its `_start_orphan_watchdog` method returns unless Redis fallback mode applies (`background_execution/service.py:200`).
These source paths can leave the job queued without a pending human obligation.
This is a source finding, not an executed failure result.

The coordinator sent the exact boundary to TRL-669 and TRL-670.
Their replacement must retain the obligation until dispatch or proof of prior execution.
The combined crash fixture must use an unexpired lease when the replacement service starts.
The previous 0.02-second fixture lease does not establish this case.

The recovery path must also cover a crash after in-memory dispatch and the obligation mark but before the runner claim.
That queued job can retain a fresh lease while its obligation is consumed.
Startup must schedule its lease-expiry recovery through the same Langflow queue path.
A drain that reads only pending obligations cannot establish recovery for this case.

## Corrected published source

TRL-668 publishes its corrected admission fragment in PR 558 at `1083c2f336f9cef76d5cb6051ce9c7197d490a37`.
The patch SHA-256 is `67ebeba0a7752b1673ca910f33ab617cbd2a30c00aa5e87371f1caef995dcb13`.
The coordinator computed that hash from the committed Git object.
The owner worktree is clean, and the PR targets main.
The pending admission API and keyword-only byte receipt mark match the confirmed contract.
This source publication does not establish runtime proof.

## Corrected dispatch source review

The current TRL-669 source validates the saved continuation receipt before dispatch.
Its execution proof requires a matching `continuation_signal_id`.
It then checks an active job, consumed signal state, or a later suspended checkpoint without the original wait.
A cancellation result leaves the obligation unmarked.
Runtime proof of these conditions remains deferred.

A fresh lease schedules one service-owned retry.
The existing startup queue loop also schedules a retry for queued jobs whose obligations are already consumed.
Its callback invokes `sweep_orphans_on_startup`.
That callback continues from the obligation drain into the existing queue loop.
After lease expiry, the queue loop calls `_enqueue` directly.
An old dispatch marker does not bypass that queued-job path.
The coordinator verified this control flow from source without a probe.

## Completed source assembly

The corrected source assembly is `backend-source-assembly.4bd0ce89e7e843114426b06c16a9d231797aeee6e56fec04323d4b2da902c4c0.patch`.
Its SHA-256 is `4bd0ce89e7e843114426b06c16a9d231797aeee6e56fec04323d4b2da902c4c0`.
The adjacent `backend-source-assembly.json` records each input and result file hash.

| Owner | Source commit | Fragment SHA-256 |
| --- | --- | --- |
| TRL-668 | `1083c2f336f9cef76d5cb6051ce9c7197d490a37` | `67ebeba0a7752b1673ca910f33ab617cbd2a30c00aa5e87371f1caef995dcb13` |
| TRL-669 | `e85b94878f74d6c303fae84c783b281b75432237` | `9d8f87f5d0ca574d236a5fd273fe1ec38edfce6729e78a73f6be33f9ff386af1` |
| TRL-670 | `25a2a986a86a9085e2ee16d77a55ed27a9aee59a` | `bf8b044614d06ef67a260db1befbe11d77891555c510581c1f0d51fb54b6b0ef` |

The coordinator reads each fragment from its immutable Git object.
The assembly contains twelve files, including the decision ledger required by startup.
It retains one shared `AsyncSession` import and all author behavior.
Nineteen original hunk headers require corrected offsets against the pinned preimages.
All original hunk counts and source lines match those preimages.
No semantic edit overlaps another author's edit.
No source assembly blocker remains.

No test, build, probe, Python import, dependency install, or candidate source mutation runs for this corrected assembly.
The earlier checks of rejected fragments do not establish a result for these bytes.
Integrated verification remains deferred until all source merges.
The independent TRL-674 acceptance review, human decisions, and production approval remain open.

## Integrated source entry

`integrations/langflow/patches/series.json` names the backend and editor patches from the repository root.
Apply the backend patch at the pinned root and the editor patch under `src/frontend` after the complete source merge.
The final TRL-668 repository source is `6761d0ffddd49d41b2ec31ac352ad32fb418634f`.
Its correlation patch bytes match the earlier assembly input.
Its final fixtures remain in the repository and accompany the combined patch.
The dense graph inputs live in `reports/langflow-large-graph-design/`.
Their synthetic values prepare the rendered checks and do not establish engine behavior.
