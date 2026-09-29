import { afterEach, beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { readDecision, readProjection } from "../../../../apps/server/src/db/queries/langflowExecution";
import {
	langflowDecisions,
	langflowExecutions,
	langflowOutbox,
} from "../../../../apps/server/src/db/tables/langflowExecution";
import { prepareDelivery, record } from "../../../../apps/server/src/services/langflowDecisions";
import { assertExecutionActive, cancelExecution } from "../../../../apps/server/src/services/langflowStops";
import { fixture } from "./fixture";
import { humanWait } from "./humanWait";

let h: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
	h = await fixture();
});
afterEach(async () => {
	await h.db.$client.close();
});

test("decision rollback removes the receipt, outbox, projection change, and events together", async () => {
	const f = await humanWait(h);
	h.events.length = 0;
	await expect(
		h.run(async (ctx, tx) => {
			await record(ctx, tx, f.input);
			throw new Error("abort decision commit");
		}),
	).rejects.toThrow("abort decision commit");
	expect(await h.db.select().from(langflowDecisions)).toHaveLength(0);
	expect(await h.db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "decision"))).toHaveLength(0);
	expect(await h.view(f.input.id)).toEqual(f.view);
	expect(h.events).toHaveLength(0);
});

test("cancel after a human decision retains its exact bytes and blocks delivery", async () => {
	const f = await humanWait(h);
	const input = { ...f.input, output: "Notes with Unicode: café\n".repeat(100_001) };
	const decided = await h.run((ctx, tx) => record(ctx, tx, input));
	const decisionId = decided.decisionDeliveries[0]!.decisionId;
	const key = { executionId: f.input.id, decisionId };
	const before = await h.run((_ctx, tx) => readDecision(tx, key));
	expect(before!.delivery.decision.output).toBe(input.output);
	expect(decided.status).not.toBe("succeeded");
	const cancellation = await h.run((ctx, tx) =>
		cancelExecution(ctx, tx, { id: input.id, expectedRevision: decided.revision }),
	);
	expect(cancellation.needsStop).toBe(false);
	expect(await h.run((ctx, tx) => prepareDelivery(ctx, tx, { ...key, authority: f.authority }), h.system)).toBeNull();
	await expect(h.run((ctx, tx) => assertExecutionActive(ctx, tx, key))).rejects.toThrow("canceled");
	const after = await h.run((_ctx, tx) => readDecision(tx, key));
	expect(after).toEqual(before);
	const [outbox] = await h.db.select().from(langflowOutbox).where(eq(langflowOutbox.id, decisionId));
	expect(outbox!.payloadBytes).toBe(before!.payloadBytes);
	expect(outbox!.receipt).toBeNull();
});

test("cancel before a human decision prevents every decision write", async () => {
	const f = await humanWait(h);
	await h.run((ctx, tx) => cancelExecution(ctx, tx, { id: f.input.id, expectedRevision: f.view.revision }));
	await expect(h.run((ctx, tx) => record(ctx, tx, f.input))).rejects.toThrow("cancellation request");
	expect(await h.db.select().from(langflowDecisions)).toHaveLength(0);
	expect(await h.db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "decision"))).toHaveLength(0);
});

test("a failed cancellation transaction permits the next human decision", async () => {
	const f = await humanWait(h);
	h.events.length = 0;
	await expect(
		h.run(async (ctx, tx) => {
			await cancelExecution(ctx, tx, { id: f.input.id, expectedRevision: f.view.revision });
			throw new Error("abort cancellation commit");
		}),
	).rejects.toThrow("abort cancellation commit");
	const [execution] = await h.db.select().from(langflowExecutions);
	expect(execution!.cancelIntent).toBeNull();
	expect(await h.db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "cancel"))).toHaveLength(0);
	expect(h.events).toHaveLength(0);
	const decided = await h.run((ctx, tx) => record(ctx, tx, f.input));
	expect(decided.decisionDeliveries).toHaveLength(1);
	expect(decided.revision).toBe(f.view.revision + 1);
});

test("two human actors cannot accept the same projected wait twice", async () => {
	const f = await humanWait(h);
	const outcomes = await Promise.allSettled([
		h.run((ctx, tx) => record(ctx, tx, f.input)),
		h.run((ctx, tx) => record(ctx, tx, { ...f.input, approved: true }), {
			...h.ctx,
			actor: { kind: "human", name: "second" },
		}),
	]);
	expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
	expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
	expect(await h.db.select().from(langflowDecisions)).toHaveLength(1);
	expect(await h.db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "decision"))).toHaveLength(1);
	const projected = await h.run((_ctx, tx) => readProjection(tx, { executionId: f.input.id }));
	expect(projected!.view.revision).toBe(f.view.revision + 1);
});

test("an agent actor cannot cancel or answer a human wait", async () => {
	const f = await humanWait(h);
	const agent = { ...h.ctx, actor: { kind: "agent" as const, name: "native-fixture" } };
	await expect(h.run((ctx, tx) => record(ctx, tx, f.input), agent)).rejects.toThrow("A person must answer");
	await expect(
		h.run((ctx, tx) => cancelExecution(ctx, tx, { id: f.input.id, expectedRevision: f.view.revision }), agent),
	).rejects.toThrow("A person must cancel");
	expect(await h.db.select().from(langflowDecisions)).toHaveLength(0);
	const [execution] = await h.db.select().from(langflowExecutions);
	expect(execution!.cancelIntent).toBeNull();
});
