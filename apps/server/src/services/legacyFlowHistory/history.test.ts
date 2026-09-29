import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { FlowExecutionSchema, FlowExecutionViewV1Schema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { openTestDb, openTestDbFromArchive } from "../../db/testDb.ts";
import { fixture } from "./fixture.ts";
import { getView } from "./getView.ts";
import { get, getMany } from "./index.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const record = fixture();
const ctx = {} as ServiceCtx;
const at = record.createdAt;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${record.projectId}, 'HST', 'history', 'History', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES ('history-status', ${record.projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${record.ticketId}, ${record.projectId}, 1, 'History', 'history-status', 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs (id,name,kind,instruction,project_key,created_at,updated_at)
		VALUES ('00000000000000000000000007','History','flow','','HST',${at},${at})`);
	await db.execute(sql`INSERT INTO agent_execution_attempts (id,run_id,generation,token_hash,created_at)
		VALUES ('retained-attempt','00000000000000000000000007',1,'fixture',${at})`);
	const { harness: _h, project: _p, ...oldFlow } = record.doc.flow;
	const oldDoc = { ...record.doc, flow: oldFlow, nodes: record.doc.nodes.map(({ harness: _n, ...node }) => node) };
	const oldState = {
		...record.state,
		steps: record.state.steps.map(({ actionKey: _a, startedAt: _s, endedAt: _e, deadlineAt: _d, ...step }) => step),
	};
	await db.execute(sql`INSERT INTO flow_executions
		(id,flow_id,ticket_id,project_id,actor_kind,actor_name,request_id,request,doc,state,revision,head_sha,created_at,updated_at)
		VALUES (${record.id},${record.flowId},${record.ticketId},${record.projectId},'human','History','history-request','{}',
		${JSON.stringify(oldDoc)}::jsonb,${JSON.stringify(oldState)}::jsonb,${record.revision},${record.headSha},${at},${record.updatedAt})`);
	await db.execute(sql`INSERT INTO flow_execution_tasks (execution_id,key,run_id,attempt_id,result_id,created_at)
		VALUES (${record.id},${record.state.steps[0]!.actionKey},'00000000000000000000000007','retained-attempt','retained-result',${at})`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("reads old snapshots without a saved definition or either scheduler", async () => {
	const before = (await db.execute(sql`SELECT doc,state FROM flow_executions WHERE id=${record.id}`)).rows[0];
	const current = await db.transaction((tx) => get(ctx, tx, { id: record.id }));
	expect(FlowExecutionSchema.parse(current)).toEqual(current);
	expect(current.doc.flow.harness).toBeNull();
	expect(current.doc.flow.project).toBeNull();
	expect(current.doc.nodes[0]!.harness).toBeNull();
	expect(current.state.steps[0]!.startedAt).toBeNull();
	expect(current.state.steps[0]!.endedAt).toBeNull();
	expect(current.state.steps[0]!.deadlineAt).toBeNull();
	expect(current.state.failureKind).toBe("feedback");
	expect(current.diffId).toBeNull();
	const view = await db.transaction((tx) => getView(ctx, tx, { id: record.id }));
	expect(FlowExecutionViewV1Schema.parse(view)).toEqual(view);
	expect(view.occurrences[0]!.attempts[0]).toMatchObject({
		agentRunId: "00000000000000000000000007",
		attemptId: "retained-attempt",
		resultId: "retained-result",
	});
	const source = (await db.execute(sql`SELECT doc::text AS document FROM flow_executions WHERE id=${record.id}`))
		.rows[0]!.document as string;
	expect(view.snapshot.documentHash).toBe(createHash("sha256").update(source).digest("hex"));
	expect((await db.execute(sql`SELECT doc,state FROM flow_executions WHERE id=${record.id}`)).rows[0]).toEqual(before);
});

test("retains order and duplicate identifiers in a batch without a definition lookup", async () => {
	const result = await db.transaction((tx) => getMany(ctx, tx, [record.id, "missing", record.id]));
	expect(result.map((item) => item.id)).toEqual([record.id, record.id]);
	expect(await db.transaction((tx) => getMany(ctx, tx, []))).toEqual([]);
});

test("restores retained bytes and task links without worker replay", async () => {
	const expected = await db.transaction((tx) => getView(ctx, tx, { id: record.id }));
	const archive = await db.$client.dumpDataDir("none");
	const restored = await openTestDbFromArchive(archive);
	const actual = await restored.transaction((tx) => getView(ctx, tx, { id: record.id }));
	expect(actual).toEqual(expected);
	expect(
		(await restored.execute(sql`SELECT count(*)::int AS count FROM agent_execution_attempts`)).rows[0]!.count,
	).toBe(1);
	await restored.$client.close();
});

test("keeps task deletion and ticket deletion cascades", async () => {
	const archive = await db.$client.dumpDataDir("none");
	const restored = await openTestDbFromArchive(archive);
	await restored.execute(sql`DELETE FROM agent_execution_attempts WHERE id='retained-attempt'`);
	const remaining = await restored.transaction((tx) => get(ctx, tx, { id: record.id }));
	expect(remaining.tasks).toEqual([]);
	expect(remaining.state.steps[0]!.output).toBe(record.state.steps[0]!.output);
	await restored.execute(sql`DELETE FROM tickets WHERE id=${record.ticketId}`);
	expect(await restored.transaction((tx) => getMany(ctx, tx, [record.id]))).toEqual([]);
	await restored.$client.close();
});

test("diff deletion clears the association and project deletion removes history", async () => {
	const archive = await db.$client.dumpDataDir("none");
	const restored = await openTestDbFromArchive(archive);
	await restored.execute(sql`INSERT INTO pull_requests (id,owner,repo,number,url,state,created_at,updated_at)
		VALUES ('00000000000000000000000008','test','history',1,'https://example.test/pr/1','open',${at},${at})`);
	await restored.execute(sql`UPDATE flow_executions SET diff_id='00000000000000000000000008' WHERE id=${record.id}`);
	const linked = await restored.transaction((tx) => getView(ctx, tx, { id: record.id }));
	expect(linked.diffId).toBe("00000000000000000000000008");
	await restored.execute(sql`DELETE FROM pull_requests WHERE id='00000000000000000000000008'`);
	const unlinked = await restored.transaction((tx) => getView(ctx, tx, { id: record.id }));
	expect(unlinked.diffId).toBeNull();
	expect(unlinked.reviewedHead).toBe(record.headSha);
	await restored.execute(sql`DELETE FROM projects WHERE id=${record.projectId}`);
	expect(await restored.transaction((tx) => getMany(ctx, tx, [record.id]))).toEqual([]);
	await restored.$client.close();
});
