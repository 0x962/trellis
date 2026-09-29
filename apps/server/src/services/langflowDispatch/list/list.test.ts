import { afterAll, beforeAll, expect, test } from "bun:test";
import { FlowExecutionIdentityV1Schema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { fixture } from "../fixture";
import { list } from "./list";

let h: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
	h = await fixture();
});
afterAll(async () => {
	await h.db.$client.close();
});

const index = () => h.db.transaction((tx) => list(h.ctx, tx, { limit: 1000 }));
const restore = async () => {
	await h.db.execute(sql`UPDATE langflow_executions SET authority=${JSON.stringify(h.authority)}::jsonb,
		submission=jsonb_set(submission,'{state}','"submitted"'), admission=admission-'state'`);
	await h.db.execute(sql`UPDATE langflow_execution_projections SET view=${JSON.stringify(h.view)}::jsonb`);
};

test("summaries preserve both stored engines and statuses without execution payloads", async () => {
	await restore();
	const rows = await index();
	expect(rows).toEqual([
		{ id: h.view.id, engine: "langflow", flowId: h.input.flowId, status: "running", pendingSubmission: false },
		{ id: h.legacy.id, engine: "legacy", flowId: h.legacy.flowId, status: "failed", pendingSubmission: false },
	]);
	for (const row of rows) expect(FlowExecutionIdentityV1Schema.parse(row)).toEqual(row);
});

test("every live submission fence remains visible in metadata", async () => {
	for (const change of [
		sql`authority=NULL`,
		sql`authority=jsonb_set(authority,'{expiresAt}','"2026-09-29T06:00:00Z"')`,
		sql`submission=jsonb_set(submission,'{state}','"reserved"')`,
		sql`submission=jsonb_set(submission,'{state}','"submission_unknown"')`,
		sql`admission=jsonb_set(admission,'{state}','"closed"')`,
	]) {
		await restore();
		await h.db.execute(sql`UPDATE langflow_executions SET ${change}`);
		expect((await index())[0]!.pendingSubmission).toBe(true);
	}
});

test("stored terminal status survives absent authority but absent projection stays unknown", async () => {
	await restore();
	await h.db.execute(sql`UPDATE langflow_executions SET authority=NULL`);
	await h.db.execute(sql`UPDATE langflow_execution_projections SET view=jsonb_set(view,'{status}','"succeeded"')`);
	expect((await index())[0]).toMatchObject({ status: "succeeded", pendingSubmission: false });
	await h.db.execute(sql`DELETE FROM langflow_execution_projections`);
	expect((await index())[0]).toMatchObject({ status: null, pendingSubmission: true });
	await h.db.execute(sql`INSERT INTO langflow_execution_projections
		(execution_id,view,revision,last_event_seq,first_available_seq)
		VALUES (${h.view.id},${JSON.stringify(h.view)}::jsonb,${h.view.revision},0,1)`);
});

test("all metadata remains accessible after five hundred newer records", async () => {
	await restore();
	await h.db.execute(sql`UPDATE langflow_executions SET authority=NULL`);
	await h.db.execute(sql`INSERT INTO flow_executions (id,flow_id,state,created_at)
		SELECT lpad((1000+n)::text,26,'0'),${h.input.flowId},'{"status":"succeeded"}'::jsonb,'2026-09-30'::timestamptz
		FROM generate_series(1,501) AS n`);
	const first = await h.db.transaction((tx) => list(h.ctx, tx, { limit: 501 }));
	const rest = await h.db.transaction((tx) => list(h.ctx, tx, { limit: 501, offset: 501 }));
	expect(first).toHaveLength(501);
	expect(rest).toHaveLength(2);
	expect(rest[0]).toMatchObject({ id: h.view.id, pendingSubmission: true });
	expect(new Set([...first, ...rest].map((row) => row.id)).size).toBe(503);
});
