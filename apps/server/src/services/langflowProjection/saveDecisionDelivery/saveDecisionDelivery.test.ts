import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	lockExecution,
	readDecision,
	recordDecision,
	updateDecisionDelivery,
} from "../../../db/queries/langflowExecution";
import { HumanDecisionReceiptV1Schema } from "../../../langflowContracts";
import { databaseFixture } from "../databaseFixture.ts";
import { getView } from "../getView";
import { saveDecisionDelivery } from "./saveDecisionDelivery.ts";

let h: Awaited<ReturnType<typeof databaseFixture>>;
beforeAll(async () => {
	h = await databaseFixture();
});
afterAll(async () => {
	await h.db.$client.close();
});

const payloadBytes = () => {
	const raw = JSON.parse(
		readFileSync(new URL("../../../langflowContracts/fixtures/human-decision.json", import.meta.url), "utf8"),
	);
	return JSON.stringify(HumanDecisionReceiptV1Schema.parse({ ...raw, wait: { ...raw.wait, ...h.f.binding } }));
};

test("a human receipt updates one revision without an engine event and replays without a write", async () => {
	const initial = h.f.view;
	const recorded = await h.call(async (ctx, tx) => {
		await lockExecution(tx, h.f.binding);
		const delivery = await recordDecision(tx, { payloadBytes: payloadBytes() });
		return saveDecisionDelivery({ ...ctx, actor: delivery.decision.actor }, tx, delivery);
	});
	expect(recorded.result.revision).toBe(initial.revision + 1);
	expect(recorded.result.lastEventSeq).toBe(initial.lastEventSeq);
	expect(recorded.result.occurrences).toEqual(initial.occurrences);
	expect(recorded.events).toEqual([{ type: "flows.changed", id: initial.flowId }]);
	const key = { executionId: initial.id, decisionId: "decision-1" };
	const replayed = await h.call(async (ctx, tx) => {
		await lockExecution(tx, key);
		const stored = await readDecision(tx, key);
		return saveDecisionDelivery(ctx, tx, stored!.delivery);
	});
	expect(replayed.result).toEqual(recorded.result);
	expect(replayed.events).toEqual([]);
	const confirmed = await h.call(async (ctx, tx) => {
		await lockExecution(tx, key);
		const stored = (await readDecision(tx, key))!;
		const acceptance = {
			version: 1 as const,
			...key,
			engineJobId: stored.engineJobId,
			engineRequestId: stored.engineRequestId,
			payloadDigest: stored.delivery.payloadDigest,
			acceptanceId: "accepted",
			signalId: "signal",
			enqueueObligationId: "enqueue",
			acceptedAt: ctx.now.toISOString(),
		};
		const delivery = await updateDecisionDelivery(tx, { ...key, state: "confirmed", acceptance });
		return saveDecisionDelivery(ctx, tx, delivery);
	});
	expect(confirmed.result.revision).toBe(recorded.result.revision + 1);
	expect(confirmed.result.lastEventSeq).toBe(initial.lastEventSeq);
	expect(confirmed.result.decisionDeliveries[0]).toMatchObject({
		state: "confirmed",
		acceptedReceiptId: "accepted",
		confirmedAt: h.f.now.toISOString(),
	});
});

test("receipt and projection rollback preserve the prior public view", async () => {
	const before = await h.call((ctx, tx) => getView(ctx, tx, { id: h.f.view.id }));
	await expect(
		h.call(async (ctx, tx) => {
			await lockExecution(tx, h.f.binding);
			const bytes = JSON.parse(payloadBytes());
			bytes.decisionId = "decision-rollback";
			bytes.wait.engineRequestId = "request-rollback";
			const delivery = await recordDecision(tx, { payloadBytes: JSON.stringify(bytes) });
			await saveDecisionDelivery(ctx, tx, delivery);
			throw new Error("abort projection");
		}),
	).rejects.toThrow("abort projection");
	const after = await h.call((ctx, tx) => getView(ctx, tx, { id: h.f.view.id }));
	expect(after.result).toEqual(before.result);
	const receipt = await h.call((_ctx, tx) =>
		readDecision(tx, { executionId: h.f.view.id, decisionId: "decision-rollback" }),
	);
	expect(receipt.result).toBeNull();
});
