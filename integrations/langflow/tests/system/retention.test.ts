import { afterEach, beforeEach, expect, test } from "bun:test";
import { FlowExecutionViewV1Schema } from "@trellis/api";
import { eq } from "drizzle-orm";
import { readDecision } from "../../../../apps/server/src/db/queries/langflowExecution";
import { langflowOutbox } from "../../../../apps/server/src/db/tables/langflowExecution";
import { openTestDbFromArchive } from "../../../../apps/server/src/db/testDb.ts";
import { record } from "../../../../apps/server/src/services/langflowDecisions";
import { getView } from "../../../../apps/server/src/services/langflowProjection";
import { databaseStore } from "../../../../apps/server/src/services/langflowStart";
import { fixture } from "./fixture";
import { humanWait } from "./humanWait";

let h: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
	h = await fixture();
});
afterEach(async () => {
	await h.db.$client.close();
});

test("an independent database reader retains decision bytes, view, and original start identity", async () => {
	const f = await humanWait(h);
	const decided = await h.run((ctx, tx) => record(ctx, tx, f.input));
	const key = { executionId: f.input.id, decisionId: decided.decisionDeliveries[0]!.decisionId };
	const receipt = await h.run((_ctx, tx) => readDecision(tx, key));
	const archive = await h.db.$client.dumpDataDir("none");
	const reopened = await openTestDbFromArchive(archive);
	try {
		const retained = await reopened.transaction((tx) => getView(h.ctx, tx, { id: f.input.id }));
		expect(retained).toEqual(decided);
		expect(await reopened.transaction((tx) => readDecision(tx, key))).toEqual(receipt);
		const alias = await reopened.transaction((tx) =>
			databaseStore(h.ctx).readRequest(tx, {
				actorKind: "human",
				actorName: "fixture",
				requestId: h.input.requestId,
			}),
		);
		expect(alias!.executionId).toBe(f.input.id);
		const [outbox] = await reopened.select().from(langflowOutbox).where(eq(langflowOutbox.id, key.decisionId));
		expect(outbox!.payloadBytes).toBe(receipt!.payloadBytes);
		expect(outbox!.receipt).toBeNull();
	} finally {
		await reopened.$client.close();
	}
});

test("opaque payload beyond dense fixture sizes survives save, fixture publication, start, and history", async () => {
	const graphDocument = {
		nodes: Array.from({ length: 501 }, (_, index) => ({ id: `node-${index}`, position: { x: index, y: index } })),
		edges: Array.from({ length: 2001 }, (_, index) => ({
			id: `edge-${index}`,
			source: `node-${index % 500}`,
			target: "node-500",
		})),
		maximumRounds: 51,
		instruction: "Unicode instructions: café\n".repeat(100_001),
	};
	const input = { ...h.saveInput, graphDocument };
	const saved = await h.save(input);
	expect(saved.graphDocument).toEqual(graphDocument);
	await h.publish();
	const started = await h.start();
	const view = await h.view(started.execution.executionId);
	expect(view.snapshot.graphDocument).toEqual(graphDocument);
	const serialized = JSON.stringify(view);
	expect(FlowExecutionViewV1Schema.parse(JSON.parse(serialized)).snapshot.graphDocument).toEqual(graphDocument);
	expect(await h.save(input)).toEqual(saved);
	expect((await h.document()).graphDocument).toEqual(graphDocument);
});
