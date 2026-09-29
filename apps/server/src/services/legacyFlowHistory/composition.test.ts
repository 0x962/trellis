import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { FlowExecutionViewV1Schema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { openTestDbFromArchive } from "../../db/testDb.ts";
import { getView } from "../langflowDispatch/getView";
import { httpFixture } from "./httpFixture.ts";
import { migratedFixture } from "./migratedFixture.ts";

let h: Awaited<ReturnType<typeof migratedFixture>>;
beforeAll(async () => {
	h = await migratedFixture();
}, 60_000);
afterAll(async () => {
	await h.db.$client.close();
});

test("real HTTP readers retain historical bytes and identities after migrations 0133 and 0134", async () => {
	const request = httpFixture(h.db, h.ctx);
	expect((await h.db.execute(sql`SELECT doc::text AS doc,state::text AS state FROM flow_executions`)).rows).toEqual(
		h.retained,
	);
	const response = await request(`/flow-executions/${h.legacy.id}/view-v1`);
	expect(response.status).toBe(200);
	const view = FlowExecutionViewV1Schema.parse(await response.json());
	expect(view).toMatchObject({ id: h.legacy.id, engine: "legacy", diffId: null, failureKind: "feedback" });
	expect(view.snapshot.revision).toBe(h.legacy.doc.flow.version);
	expect(view.snapshot.documentHash).toBe(
		createHash("sha256")
			.update(h.retained[0]!.doc as string)
			.digest("hex"),
	);
	expect(view.snapshot.flow.harness).toBeNull();
	expect(view.snapshot.flow.project).toBeNull();
	expect(view.snapshot.diagnostics.map((d) => d.code)).toContain("LEGACY_STOP_TIME_UNKNOWN");
	expect(view.stopObligations).toEqual([]);
	expect(view.occurrences[0]).toMatchObject({
		output: h.legacy.state.steps[0]!.output,
		startedAt: null,
		endedAt: null,
		outputSource: {
			stepId: h.legacy.state.steps[0]!.actionKey,
			agentRunId: "00000000000000000000000007",
			attemptId: "retained-attempt",
			resultId: "retained-result",
		},
	});
	const replacement = await request(`/flow-executions/${h.replacement.view.id}/view-v1`);
	expect(replacement.status).toBe(200);
	expect(FlowExecutionViewV1Schema.parse(await replacement.json())).toEqual(h.replacement.view);
	const missing = await request("/flow-executions/00000000000000000000000999/view-v1");
	expect(missing.status).toBe(404);
});

test("both engines remain readable after archive restore and saved flow deletion", async () => {
	const ids = [h.legacy.id, h.replacement.view.id];
	const expected = await Promise.all(ids.map((id) => h.db.transaction((tx) => getView(h.ctx, tx, { id }))));
	const restored = await openTestDbFromArchive(await h.db.$client.dumpDataDir("none"));
	const request = httpFixture(restored, h.ctx);
	await restored.execute(sql`DELETE FROM flows WHERE id=${h.legacy.flowId}`);
	for (const [index, id] of ids.entries()) {
		const response = await request(`/flow-executions/${id}/view-v1`);
		expect(response.status).toBe(200);
		expect(FlowExecutionViewV1Schema.parse(await response.json())).toEqual(expected[index]!);
	}
	expect((await restored.execute(sql`SELECT doc::text AS doc,state::text AS state FROM flow_executions`)).rows).toEqual(
		h.retained,
	);
	expect((await restored.execute(sql`SELECT count(*)::int AS n FROM agent_execution_attempts`)).rows).toEqual([
		{ n: 1 },
	]);
	expect((await restored.execute(sql`SELECT count(*)::int AS n FROM langflow_executions`)).rows).toEqual([{ n: 1 }]);
	await restored.execute(sql`DELETE FROM tickets WHERE id=${h.legacy.ticketId}`);
	for (const id of ids) expect((await request(`/flow-executions/${id}/view-v1`)).status).toBe(404);
	await restored.$client.close();
});
