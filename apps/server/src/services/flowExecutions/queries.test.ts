import { expect, test } from "bun:test";
import { FlowExecutionSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { flowDoc, node } from "../../agents/nativeFlow/testDoc.ts";
import type { ServiceCtx } from "../../context.ts";
import { openTestDb } from "../../db/testDb.ts";
import { get } from "./queries.ts";

test("a stored flow execution without the harness fields or the project key reads as current output", async () => {
	const db = await openTestDb();
	const at = new Date("2026-09-21T00:00:00.000Z");
	const flowId = ulid();
	const step = ulid();
	const project = ulid();
	const status = ulid();
	const ticket = ulid();
	const execution = ulid();
	const baseDoc = flowDoc([node(step, "agent", null)], []);
	const doc = { ...baseDoc, flow: { ...baseDoc.flow, id: flowId } };
	// A run stored before the harness and project fields existed holds none of
	// them in its snapshot: neither harness, nor the project of the flow.
	const { harness: _flowHarness, project: _project, ...oldFlow } = doc.flow;
	const oldDoc = { ...doc, flow: oldFlow, nodes: doc.nodes.map(({ harness: _nodeHarness, ...oldNode }) => oldNode) };
	const state = {
		version: 1,
		flowId: doc.flow.id,
		flowVersion: doc.flow.version,
		status: "succeeded",
		startedAt: at.getTime(),
		updatedAt: at.getTime(),
		error: null,
		steps: [
			{
				key: `root/1/${step}`,
				nodeId: step,
				parentKey: null,
				iteration: 1,
				round: 1,
				state: "succeeded",
				phase: "step",
				output: "Done",
				decision: null,
				error: null,
				startedAt: at.getTime(),
				endedAt: at.getTime(),
				deadlineAt: null,
				needsStop: false,
			},
		],
	};
	await db.execute(
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES ('Test', 'human', ${at}, ${at})`,
	);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${project}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, color, position, is_default, created_at, updated_at
	) VALUES (${status}, ${project}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, number, title, status_id, position, created_at, updated_at
	) VALUES (${ticket}, ${project}, 1, 'Task', ${status}, 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO flow_executions (
		id, flow_id, ticket_id, project_id, actor_kind, actor_name, request_id,
		request, doc, state, revision, created_at, updated_at
	) VALUES (
		${execution}, ${doc.flow.id}, ${ticket}, ${project}, 'human', 'Test', ${crypto.randomUUID()},
		'{}', ${JSON.stringify(oldDoc)}::jsonb, ${JSON.stringify(state)}::jsonb, 1, ${at}, ${at}
	)`);
	const ctx = {
		actor: null,
		session: null,
		reqId: "test",
		now: at,
		emit: () => {},
		cache: {} as never,
		actorCache: new Map<string, number>(),
		dropBlobs: () => {},
		publicUrl: "http://127.0.0.1:4521",
	} satisfies ServiceCtx;

	const record = await db.transaction((tx) => get(ctx, tx, { id: execution }));

	expect(record.doc.flow.harness).toBeNull();
	expect(record.doc.flow.project).toBeNull();
	expect(record.doc.nodes[0]?.harness).toBeNull();
	expect(FlowExecutionSchema.parse(record)).toEqual(record);
	await db.$client.close();
});
