import { afterEach, beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { readDecision, readExecution } from "../../../../apps/server/src/db/queries/langflowExecution";
import { langflowOutbox } from "../../../../apps/server/src/db/tables/langflowExecution";
import { record } from "../../../../apps/server/src/services/langflowDecisions";
import { cancelView } from "../../../../apps/server/src/services/langflowStops";
import { fixture } from "./fixture";
import { humanWait } from "./humanWait";

let h: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
	h = await fixture();
});
afterEach(async () => {
	await h.db.$client.close();
});

test("cancel response recovery retains the accepted decision and original cancellation", async () => {
	const f = await humanWait(h);
	const decided = await h.run((ctx, tx) => record(ctx, tx, f.input));
	const key = { executionId: f.input.id };
	const decisionKey = { ...key, decisionId: decided.decisionDeliveries[0]!.decisionId };
	const decision = await h.run((_ctx, tx) => readDecision(tx, decisionKey));
	const input = { id: f.input.id, expectedRevision: decided.revision };
	const canceled = await h.run((ctx, tx) => cancelView(ctx, tx, input));
	const execution = await h.run((_ctx, tx) => readExecution(tx, key));
	const outbox = await h.db.select().from(langflowOutbox).orderBy(langflowOutbox.id);
	expect(canceled.status).toBe("canceled");
	expect(canceled.revision).toBe(decided.revision + 1);
	expect(canceled.snapshot).toEqual(decided.snapshot);
	expect(canceled.publication).toEqual(decided.publication);
	expect(canceled.occurrences).toEqual(decided.occurrences);
	expect(canceled.decisionDeliveries).toEqual(decided.decisionDeliveries);
	expect(execution!.cancelIntent).not.toBeNull();
	expect(outbox.filter((row) => row.kind === "cancel")).toHaveLength(1);

	h.events.length = 0;
	await expect(h.run((ctx, tx) => cancelView(ctx, tx, input))).rejects.toMatchObject({
		code: "FLOW_VERSION_CONFLICT",
		data: { version: canceled.revision },
	});
	const reread = await h.view(input.id);
	expect(reread).toEqual(canceled);
	expect(await h.run((ctx, tx) => cancelView(ctx, tx, { ...input, expectedRevision: reread.revision }))).toEqual(
		reread,
	);
	expect((await h.run((_ctx, tx) => readExecution(tx, key)))!.cancelIntent).toEqual(execution!.cancelIntent);
	expect(await h.run((_ctx, tx) => readDecision(tx, decisionKey))).toEqual(decision);
	expect(await h.db.select().from(langflowOutbox).orderBy(langflowOutbox.id)).toEqual(outbox);
	expect(h.events).toHaveLength(0);
});

test("cancel view rollback preserves the committed human decision and public revision", async () => {
	const f = await humanWait(h);
	const decided = await h.run((ctx, tx) => record(ctx, tx, f.input));
	const key = { executionId: f.input.id };
	const decisionKey = { ...key, decisionId: decided.decisionDeliveries[0]!.decisionId };
	const decision = await h.run((_ctx, tx) => readDecision(tx, decisionKey));
	const outbox = await h.db.select().from(langflowOutbox).orderBy(langflowOutbox.id);
	h.events.length = 0;
	await expect(
		h.run(async (ctx, tx) => {
			const canceled = await cancelView(ctx, tx, { id: f.input.id, expectedRevision: decided.revision });
			expect(canceled.status).toBe("canceled");
			throw new Error("abort cancellation view commit");
		}),
	).rejects.toThrow("abort cancellation view commit");
	expect((await h.run((_ctx, tx) => readExecution(tx, key)))!.cancelIntent).toBeNull();
	expect(await h.view(f.input.id)).toEqual(decided);
	expect(await h.run((_ctx, tx) => readDecision(tx, decisionKey))).toEqual(decision);
	expect(await h.db.select().from(langflowOutbox).orderBy(langflowOutbox.id)).toEqual(outbox);
	expect(await h.db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "cancel"))).toHaveLength(0);
	expect(h.events).toHaveLength(0);
});
