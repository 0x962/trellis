import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	langflowExecutionProjections,
	langflowExecutions,
	langflowStartReceipts,
} from "../../../../apps/server/src/db/tables/langflowExecution";
import { reserveStart } from "../../../../apps/server/src/services/langflowStart";
import { fixture } from "./fixture";

let h: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
	h = await fixture();
});
afterEach(async () => {
	await h.db.$client.close();
});

test("save, publication, and reservation retain one snapshot with unknown authority", async () => {
	const saved = await h.save();
	await expect(h.start()).rejects.toThrow("Publish the current saved document");
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(0);
	const publication = await h.publish();
	const reservation = await h.start();
	const view = await h.view(reservation.execution.executionId);
	expect(view.snapshot.graphDocument).toEqual(saved.graphDocument);
	expect(view.publication).toEqual(publication!);
	expect(view.submission).toMatchObject({
		admission: "closed",
		ownership: "unknown",
		engineEpoch: null,
		engineJobId: null,
	});
	expect(view.status).not.toBe("succeeded");
	expect(view.snapshot).not.toHaveProperty("lastExecutablePublication");
	expect(view.snapshot).not.toHaveProperty("publication");
	const [stored] = await h.db.select().from(langflowExecutions);
	expect(stored!.actorKind).toBe("human");
	expect(stored!.actorName).toBe("fixture");
	expect(stored!.snapshot).toEqual(view.snapshot);
});

test("a failed reservation transaction retains no receipt, projection, execution, or event", async () => {
	await h.save();
	await h.publish();
	h.events.length = 0;
	await expect(
		h.run(async (ctx, tx) => {
			await h.reserveAndInitialize(ctx, tx);
			throw new Error("abort before commit");
		}),
	).rejects.toThrow("abort before commit");
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(0);
	expect(await h.db.select().from(langflowStartReceipts)).toHaveLength(0);
	expect(await h.db.select().from(langflowExecutionProjections)).toHaveLength(0);
	expect(h.events).toHaveLength(0);
	const retried = await h.start();
	expect((await h.view(retried.execution.executionId)).revision).toBe(1);
});

test("equal concurrent UUIDs return one execution and reject changed input", async () => {
	await h.save();
	await h.publish();
	const results = await Promise.all([h.start(), h.start()]);
	expect(results[0]!.execution.executionId).toBe(results[1]!.execution.executionId);
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(1);
	expect(await h.db.select().from(langflowStartReceipts)).toHaveLength(1);
	expect(await h.db.select().from(langflowExecutionProjections)).toHaveLength(1);
	await expect(h.start({ ...h.input, headSha: "b".repeat(40) })).rejects.toThrow("different flow start");
	expect((await h.start()).execution.executionId).toBe(results[0]!.execution.executionId);
});

test("a newer draft cannot replace an execution snapshot or authorize an explicit repeat", async () => {
	const saved = await h.save();
	await h.publish();
	const first = await h.start();
	await h.save({
		...h.saveInput,
		requestId: crypto.randomUUID(),
		expectedVersion: saved.revision,
		graphDocument: { nodes: [], edges: [], marker: "new draft" },
	});
	expect((await h.document()).revision).toBe(saved.revision + 1);
	expect((await h.view(first.execution.executionId)).snapshot.graphDocument).toEqual(saved.graphDocument);
	expect((await h.start()).execution.executionId).toBe(first.execution.executionId);
	await expect(
		h.start({
			...h.input,
			requestId: crypto.randomUUID(),
			expectedVersion: saved.revision + 1,
			allowRepeat: true,
			repeatReason: "Requested repeat",
		}),
	).rejects.toThrow("Publish the current saved document");
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(1);
});

test("missing and system actors cannot create a public reservation", async () => {
	await h.save();
	await h.publish();
	for (const [actor, code] of [
		[null, "ACTOR_REQUIRED"],
		[h.system.actor, "INPUT_VALIDATION_FAILED"],
	] as const)
		await expect(
			h.run((ctx, tx) => reserveStart({ ...ctx, actor }, tx, h.input, { hostId: "system-fixture-host" })),
		).rejects.toMatchObject({ code });
	expect(await h.db.select().from(langflowExecutions)).toHaveLength(0);
});
