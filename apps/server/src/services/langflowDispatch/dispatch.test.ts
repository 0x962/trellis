import { afterAll, beforeAll, expect, test } from "bun:test";
import { FlowExecutionViewV1Schema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { fixture } from "./fixture.ts";
import { getView } from "./getView.ts";
import { list } from "./list.ts";
import { startLegacy } from "./startLegacy.ts";

let h: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
	h = await fixture();
});
afterAll(async () => {
	await h.db.$client.close();
});

test("stored executions retain their engine and archived data after document conversion", async () => {
	const legacy = await h.db.transaction((tx) => getView(h.ctx, tx, { id: h.legacy.id }));
	const replacement = await h.db.transaction((tx) => getView(h.ctx, tx, { id: h.view.id }));
	expect(FlowExecutionViewV1Schema.parse(legacy).engine).toBe("legacy");
	expect(legacy.occurrences[0]!.output).toBe(h.legacy.state.steps[0]!.output);
	expect(legacy.snapshot.revision).toBe(h.legacy.doc.flow.version);
	expect(replacement).toEqual(h.view);
	await expect(
		h.db.transaction((tx) => getView(h.ctx, tx, { id: "00000000000000000000000999" })),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("the combined index pages and filters across engines", async () => {
	const all = await h.db.transaction((tx) => list(h.ctx, tx, { flow: "review", limit: 501 }));
	expect(all).toEqual([
		{ id: h.view.id, engine: "langflow" },
		{ id: h.legacy.id, engine: "legacy" },
	]);
	expect(await h.db.transaction((tx) => list(h.ctx, tx, { limit: 1, offset: 1 }))).toEqual([all[1]!]);
	expect(await h.db.transaction((tx) => list(h.ctx, tx, { diffId: h.input.diffId! }))).toEqual([all[0]!]);
});

test("legacy start replays its exact request but rejects new starts of converted documents", async () => {
	const replay = await h.db.transaction((tx) => startLegacy(h.ctx, tx, h.request));
	expect(replay.id).toBe(h.legacy.id);
	await expect(
		h.db.transaction((tx) => startLegacy(h.ctx, tx, { ...h.request, flow: "different" })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(
		h.db.transaction((tx) => startLegacy(h.ctx, tx, { ...h.request, requestId: crypto.randomUUID() })),
	).rejects.toMatchObject({ code: "FLOW_UNSUPPORTED_FORMAT" });
	await expect(
		h.db.transaction((tx) => startLegacy(h.ctx, tx, { ...h.request, requestId: h.input.requestId })),
	).rejects.toMatchObject({ code: "FLOW_UNSUPPORTED_FORMAT" });
	const rows = await h.db.execute(sql`SELECT id FROM flow_executions`);
	expect(rows.rows).toHaveLength(1);
});
