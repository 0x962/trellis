import { afterAll, beforeAll, expect, test } from "bun:test";
import { readCheckpoint, readProjection, retainEvents } from "../../db/queries/langflowExecution";
import { databaseFixture } from "./databaseFixture.ts";
import { getView } from "./getView.ts";
import { replay } from "./replay.ts";
import { update } from "./update.ts";

let h: Awaited<ReturnType<typeof databaseFixture>>;
beforeAll(async () => {
	h = await databaseFixture();
});
afterAll(async () => {
	await h.db.$client.close();
});

const event = (id: string, epoch = 1) =>
	JSON.stringify({
		version: 1,
		...h.f.binding,
		engineEpoch: epoch,
		sourceEventId: id,
		occurredAt: "2026-09-29T06:00:00Z",
		occurrence: null,
		payload: { kind: "execution_started", receiptId: id },
	});
const input = (sourceBytes: string | null) => ({
	executionId: h.f.view.id,
	authority: h.authority,
	observation: h.f.observed,
	sourceBytes,
});

test("journal replay, revision conflicts, retention and rollback share the real storage transaction", async () => {
	const first = await h.call((ctx, tx) => update(ctx, tx, input(event("first"))));
	expect(first.result.event!.seq).toBe(1);
	const checkpoint = await h.call((_ctx, tx) => readCheckpoint(tx, { executionId: h.f.view.id }));
	expect(checkpoint.result).toEqual(h.f.observed.checkpoint);
	expect(first.events).toEqual([{ type: "flows.changed", id: h.f.view.flowId }]);
	const duplicate = await h.call((ctx, tx) =>
		update(ctx, tx, { ...input(event("first")), authority: { ...h.authority, engineEpoch: 2 } }),
	);
	expect(duplicate.result.state).toBe("duplicate");
	expect(duplicate.result.event!.seq).toBe(1);
	expect(duplicate.events).toEqual([]);
	await expect(h.call((ctx, tx) => update(ctx, tx, input(`${event("first")} `)))).rejects.toThrow("identity_conflict");
	await expect(h.call((ctx, tx) => update(ctx, tx, input(event("stale", 2))))).rejects.toThrow("stale_owner");
	await expect(h.call((ctx, tx) => update(ctx, tx, input(event("late"))))).rejects.toThrow("projection_conflict");
	h.f.observed.expectedRevision = 2;
	const second = await h.call((ctx, tx) => update(ctx, tx, input(event("second"))));
	expect(second.result.event!.seq).toBe(2);
	const page = await h.call((ctx, tx) =>
		replay(ctx, tx, { version: 1, executionId: h.f.view.id, afterSeq: 0, limit: 1 }),
	);
	expect(page.result).toMatchObject({ state: "events", nextSeq: 1, hasMore: true });
	await h.call((_ctx, tx) => retainEvents(tx, { executionId: h.f.view.id, firstAvailableSeq: 2 }));
	const gap = await h.call((ctx, tx) =>
		replay(ctx, tx, { version: 1, executionId: h.f.view.id, afterSeq: 0, limit: 1 }),
	);
	expect(gap.result).toMatchObject({ state: "gap", firstAvailableSeq: 2, snapshotLastSeq: 2, snapshotRevision: 3 });
	const retained = await h.call((ctx, tx) => update(ctx, tx, input(event("first"))));
	expect(retained.result).toMatchObject({ state: "duplicate", event: { seq: 1 } });
	h.f.observed.expectedRevision = 3;
	const reconciled = await h.call((ctx, tx) => update(ctx, tx, input(null)));
	expect(reconciled.result.view).toMatchObject({ revision: 4, lastEventSeq: 2 });
	h.f.observed.expectedRevision = 4;
	await expect(
		h.call(async (ctx, tx) => {
			await update(ctx, tx, input(event("rollback")));
			throw new Error("rollback");
		}),
	).rejects.toThrow("rollback");
	const saved = await h.call((_ctx, tx) => readProjection(tx, { executionId: h.f.view.id }));
	expect(saved.result!.view).toMatchObject({ revision: 4, lastEventSeq: 2 });
	const view = await h.call((ctx, tx) => getView(ctx, tx, { id: h.f.view.id }));
	expect(view.result).toEqual(saved.result!.view);
});
