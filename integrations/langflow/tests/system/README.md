# Combined service fixtures

The `.test.ts` fixtures compose public services against the database from `openTestDb`.
That helper applies the production migration journal to an isolated PGlite database.
The fixtures create no substitute tables and launch no agent, engine, provider, or server.

`composed/run.ts` is a separate HTTP entrypoint for an owner-supplied isolated host.
Its [input contract](composed/README.md) requires actual package qualification and runtime receipts.
Its source remains unexecuted. The [batch procedure](../../../../reports/langflow-integration-evidence/batch.md) retains all proof categories.

`fixture` calls the document save, publication, reservation, and projection services.
The fixture-only `seedLangflowDocument` helper persists its initial Langflow revision before the first generic save.
The first save increments that revision through the document service and its engine-change guard.
It retains the request actor during reservation and uses `SYSTEM_ACTOR` only for projection initialization.
Both operations share one transaction and its event collector.
The public view uses a separate transaction after commit.

Publication uses the existing `flowDocuments/fixture` publisher.
That publisher supplies synthetic validation and an immutable receipt.
`humanWait` supplies a synthetic correlation, authority, and checkpoint through the actual storage and projection interfaces.
Langflow does not execute a graph in these cases.

| File | Required assertions |
| --- | --- |
| `start.test.ts` | Current publication, null unknown epoch, atomic reservation, concurrent UUID replay, immutable snapshot, actor checks |
| `decisionCancellation.test.ts` | Atomic human receipt, cancellation order, retained bytes, delivery refusal, competing actors, authorization |
| `cancelView.test.ts` | Committed human decision through public cancellation, stale-response recovery, stable cancellation identity, atomic public-state rollback |
| `retention.test.ts` | Independent archive reader, permanent request identity, exact decision outbox, opaque payload beyond fixture sizes |

The transaction exceptions simulate failure before commit.
They do not prove process death, engine admission, successor release, or exact native exit.
The archive case reopens a database copy. It does not exercise paired-store restore or production rollback.
The actor cases test service authorization. They do not exercise HTTP authentication.
The payload case tests opaque document retention. It does not prove valid engine topology or client rendering.

## Required source

The combined batch must include document migration 0133, receipt migration 0134, and their observer predecessor 0132.
The projection initializer must retain null for an unknown engine epoch, as published in PR 636.
The start service must include the repair from PR 669.
The fixture deliberately fails when those requirements are absent.
It adds no skip, substitute schema, or invented epoch.

The complete acceptance requirements remain in `reports/langflow-integration-evidence/acceptance.md`.
All runtime and UI gates remain separate from these focused fixtures.
The cancellation cases call the public `cancelView` service and its projection producer in one transaction.
Public V1 mutation routes and actual engine transport remain separate integration requirements.

## Commands after the source batch merges

Run from the repository root with its existing dependencies:

```sh
bun test --config integrations/langflow/tests/system/bunfig.toml integrations/langflow/tests/system --timeout 60000
./node_modules/.bin/tsc --noEmit -p integrations/langflow/tests/system/tsconfig.json
bun run --cwd apps/server typecheck
./node_modules/.bin/biome check integrations/langflow/tests/system
git diff --check
```

Use hosted CI for broad checks. Retain the exact combined revision and command output with each result.
