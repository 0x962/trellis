import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { edge, node } from "../agents/nativeFlow/testDoc.ts";
import { readExecution } from "../services/flowExecutions/queries.ts";
import { testFixture } from "../services/flowExecutions/testFixture";
import { save as saveFlow } from "../services/flows/save.ts";

let h: Awaited<ReturnType<typeof testFixture>>;
beforeAll(async () => {
	h = await testFixture();
}, 30_000);
afterAll(async () => {
	await h.db.$client.close();
});

test("the Review migration keeps unrelated gates, edges, and execution snapshots", async () => {
	const setup = await h.createExecution();
	const front = { ...node(ulid(), "gate", null), title: "Frontend relevant?", harness: { preset: "codex" as const } };
	const back = { ...node(ulid(), "gate", null), title: "Backend relevant?", harness: { preset: "codex" as const } };
	const other = {
		...node(ulid(), "gate", null),
		title: "Readability relevant?",
		harness: { preset: "codex" as const },
	};
	const review = node(ulid(), "agent", null);
	const doc = await h.run((tx) =>
		saveFlow(h.ctx, tx, {
			flow: setup.input.flow,
			nodes: [front, back, other, review],
			edges: [{ ...edge(front.id, review.id, "yes"), id: ulid() }],
		}),
	);
	setup.input.expectedVersion = doc.flow.version;
	const execution = await setup.create();
	await h.db.execute(sql`UPDATE flows SET slug='review' WHERE id=${execution.flowId}`);
	const before = await h.run((tx) => readExecution(tx, execution.id));
	const script = await Bun.file(new URL("../../drizzle/0127_petite_zombie.sql", import.meta.url)).text();
	await h.db.execute(sql.raw(script.split("--> statement-breakpoint")[2]!));
	const gates = await h.db.execute(
		sql`SELECT review_area,harness FROM flow_nodes WHERE id IN (${front.id},${back.id}) ORDER BY review_area`,
	);
	expect(gates.rows).toEqual([
		{ review_area: "backend", harness: null },
		{ review_area: "frontend", harness: null },
	]);
	expect((await h.db.execute(sql`SELECT review_area,harness FROM flow_nodes WHERE id=${other.id}`)).rows).toEqual([
		{ review_area: null, harness: { preset: "codex" } },
	]);
	expect((await h.db.execute(sql`SELECT * FROM flow_edges WHERE flow_id=${execution.flowId}`)).rows).toHaveLength(1);
	expect((await h.run((tx) => readExecution(tx, execution.id))).doc).toEqual(before.doc);
});
