import type { FlowExecutionStartInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { receiptFixture } from "../../../db/queries/langflowExecution/fixtures/fixture.ts";
import { fixture as legacyRecord } from "../../legacyFlowHistory/fixture.ts";

export const fixture = async () => {
	const h = await receiptFixture();
	const legacy = { ...legacyRecord(), id: "00000000000000000000000099" };
	const request: FlowExecutionStartInput = {
		flow: legacy.flowId,
		ticket: legacy.ticketId,
		expectedVersion: 1,
		requestId: "00000000-0000-4000-8000-000000000099",
	};
	await h.db.$client.exec(`
		CREATE TABLE flow_executions (
			id text PRIMARY KEY, flow_id text, ticket_id text, project_id text, diff_id text,
			actor_kind text, actor_name text, request_id text, request jsonb, revision integer,
			head_sha text, doc jsonb, state jsonb, created_at timestamptz, updated_at timestamptz
		);
		CREATE TABLE flow_execution_tasks (
			execution_id text, key text, run_id text, attempt_id text, result_id text, created_at timestamptz
		);
	`);
	await h.db.execute(sql`INSERT INTO flow_executions VALUES (
		${legacy.id},${legacy.flowId},${legacy.ticketId},${legacy.projectId},NULL,
		'human','fixture',${request.requestId},${JSON.stringify(request)}::jsonb,${legacy.revision},
		${legacy.headSha},${JSON.stringify(legacy.doc)}::jsonb,${JSON.stringify(legacy.state)}::jsonb,
		${legacy.createdAt},${legacy.updatedAt}
	)`);
	const ctx: ServiceCtx = {
		actor: { kind: "human", name: "fixture" },
		session: null,
		reqId: "composition",
		now: new Date("2026-09-29T06:05:00Z"),
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	};
	return { ...h, legacy, request, ctx };
};
