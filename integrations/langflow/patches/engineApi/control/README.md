# Private engine cancellation

`create_cancellation_router(security=..., sessions=..., background=...)` returns
an `APIRouter` with the relative prefix `/cancellation`. The shared engine API
mounts it under `/trellis-v1`. `sessions` opens the real engine database.
`background` is the existing `BackgroundExecutionService`.

POST accepts `executionId`, `publicationId`, `engineJobId`, `requestId`,
`cancelIntentBytes`, and `authorityBytes`. The bytes contain the original
serialized `CancelIntentV1` and the exact stored delivery authority.
The job lock precedes the `execution.cancel` authority check.

The transaction stores a permanent `JobCheckpoint` with kind
`trellis-cancellation-v1` and an `ExecutionSignal` of type STOP. The checkpoint
contains the exact request bytes and an immutable cancellation receipt.
An equal request returns that receipt. Changed bytes return HTTP 409.
A renewed authority can deliver the same cancellation bytes.

The response contains `receipt` and `engineStatus`. The receipt contains
`version`, `receiptId`, `requestId`, `executionId`, `engineJobId`,
`cancelIntentDigest`, and `acceptedAt`. The service reads `engineStatus` from
the job after `stop_job`. A stop error propagates while the receipt remains.
An engine status does not confirm a native process exit.

`replay_cancellations(sessions, background)` drains committed cancellation
checkpoints before the host admits graph work. It calls the existing `stop_job`
for nonterminal jobs. It preserves failed, timed-out, completed, and canceled
jobs. A replay failure prevents successful startup. Repeated effects use the
same job and receipt; `stop_job` owns its existing cooperative stop behavior.

`assert_not_cancelled(session, job_id)` rejects a permanent cancellation marker,
including after STOP consumption. Completion, admission, and continuation
writers call it while they hold the Job lock through their writes. TRL-669 owns
those shared callers. TRL-674 owns their patch assembly. TRL-875 owns the root
router and startup replay call. The independent patch adds only these modules.

The fixtures cover the database and HTTP boundaries with a controlled stop
adapter. They do not prove actual engine or native process termination.
Run them against the assembled pinned engine source:

```sh
python -m pytest integrations/langflow/patches/engineApi/control/tests
```

The capacity hold defers fixture execution and Review. Runtime acceptance also
requires the shared guards, startup call, and actual engine stop proof.

`assembly-guards.patch` contains the completion, admission, and continuation
hunks for the shared engine owner. `assembly-bases.json` records the source
fragment hashes. The assembly owner must place these hunks in the combined
source and regenerate its patch. The independent module manifest excludes them.
The shared queue transaction also holds the Job lock through actual submission
and the dispatch receipt. The runner must preserve FAILED and TIMED_OUT when
it reconciles STOP. Those shared repairs remain with TRL-669.
