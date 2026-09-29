import { describe, expect, test } from "bun:test";
import { protocolDigest } from "../../../langflowContracts";
import { testFixture } from "../testFixture";
import { createReceipt } from "./createReceipt.ts";

describe("human receipt", () => {
	test("keeps negative feedback, exact engine wait, and notes beyond former limits", () => {
		const f = testFixture();
		f.input.output = "é\n".repeat(100_001);
		const saved = createReceipt(f.ctx, f.view, f.checkpoint, f.input);
		expect(saved.delivery.decision.approved).toBe(false);
		expect(saved.delivery.decision.output).toBe(f.input.output);
		expect(saved.delivery.decision.wait).toEqual(f.wait);
		expect(saved.delivery.payloadDigest).toBe(protocolDigest(saved.payloadBytes));
		expect(f.view.status).toBe("running");
	});
	test("rejects agents and native completion actors", () => {
		const f = testFixture();
		for (const kind of ["agent", "system"] as const) {
			expect(() => createReceipt({ ...f.ctx, actor: { kind, name: "worker" } }, f.view, f.checkpoint, f.input)).toThrow(
				"A person must answer",
			);
		}
	});
	test("rejects stale revision without rebinding to the next occurrence", async () => {
		const f = testFixture();
		f.view.revision++;
		await expect(
			Promise.resolve().then(() => createReceipt(f.ctx, f.view, f.checkpoint, f.input)),
		).rejects.toMatchObject({
			code: "FLOW_VERSION_CONFLICT",
			data: { version: f.view.revision },
		});
	});
	test("requires the exact action and occurrence", async () => {
		const f = testFixture();
		await expect(
			Promise.resolve().then(() => createReceipt(f.ctx, f.view, f.checkpoint, { ...f.input, key: "next-human" })),
		).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT", data: { version: f.view.revision } });
		f.view.occurrences[0]!.iterationPath = [{ loopNodeId: "outer", round: 99 }];
		expect(() => createReceipt(f.ctx, f.view, f.checkpoint, f.input)).toThrow("identity_conflict");
	});
	test("refuses a native wait and a terminal execution", () => {
		const f = testFixture();
		f.view.occurrences[0]!.waitReason = "native";
		expect(() => createReceipt(f.ctx, f.view, f.checkpoint, f.input)).toThrow();
		f.view.occurrences[0]!.waitReason = "human";
		f.view.status = "canceled";
		expect(() => createReceipt(f.ctx, f.view, f.checkpoint, f.input)).toThrow();
	});
	test("refuses duplicate approval while its receipt remains unresolved", async () => {
		const f = testFixture();
		f.view.decisionDeliveries.push({
			decisionId: "decision-1",
			payloadDigest: "a".repeat(64),
			engineRequestId: f.wait.engineRequestId,
			actionKey: f.input.key,
			occurrenceKey: f.wait.occurrence.occurrenceKey,
			actor: { kind: "human", name: "another" },
			approved: true,
			output: "Saved notes",
			expectedRevision: f.input.expectedRevision,
			recordedAt: f.ctx.now.toISOString(),
			state: "unknown",
			acceptedReceiptId: null,
			confirmedAt: null,
		});
		await expect(
			Promise.resolve().then(() => createReceipt(f.ctx, f.view, f.checkpoint, f.input)),
		).rejects.toMatchObject({
			code: "FLOW_VERSION_CONFLICT",
			data: { version: f.view.revision },
		});
	});
});
