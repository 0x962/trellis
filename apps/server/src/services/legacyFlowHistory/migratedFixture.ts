import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { migrate } from "../../db/migrate.ts";
import { receiptFixture } from "../../db/queries/langflowExecution/fixtures/fixture.ts";
import { beforeDocuments } from "../../db/queries/langflowExecution/fixtures/migration.ts";
import { fixture } from "./fixture.ts";

export async function migratedFixture() {
	const db = await beforeDocuments();
	const legacy = { ...fixture(), id: "00000000000000000000000099" };
	const { harness: _h, project: _p, ...flow } = legacy.doc.flow;
	const doc = { ...legacy.doc, flow, nodes: legacy.doc.nodes.map(({ harness: _n, ...node }) => node) };
	const state = {
		...legacy.state,
		steps: legacy.state.steps.map(({ actionKey: _a, startedAt: _s, endedAt: _e, ...step }) => ({
			...step,
			needsStop: true,
		})),
	};
	await db.execute(sql`UPDATE flow_executions SET id=${legacy.id}, doc=${JSON.stringify(doc)}::jsonb,
		state=${JSON.stringify(state)}::jsonb, head_sha=${legacy.headSha}, revision=${legacy.revision}
		WHERE id='legacy-execution'`);
	await db.execute(sql`INSERT INTO agent_runs (id,name,kind,instruction,project_key,created_at,updated_at)
		VALUES ('00000000000000000000000007','History','flow','','TRL',${legacy.createdAt},${legacy.updatedAt})`);
	await db.execute(sql`INSERT INTO agent_execution_attempts (id,run_id,generation,token_hash,created_at)
		VALUES ('retained-attempt','00000000000000000000000007',1,'fixture',${legacy.createdAt})`);
	await db.execute(sql`INSERT INTO flow_execution_tasks (execution_id,key,run_id,attempt_id,result_id,created_at)
		VALUES (${legacy.id},${legacy.state.steps[0]!.actionKey},'00000000000000000000000007',
		'retained-attempt','retained-result',${legacy.createdAt})`);
	const retained = (await db.execute(sql`SELECT doc::text AS doc, state::text AS state FROM flow_executions`)).rows;
	await migrate(db);
	const replacement = await receiptFixture(true, db);
	const ctx: ServiceCtx = {
		actor: null,
		session: null,
		reqId: "history",
		now: new Date(legacy.updatedAt),
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	};
	return { db, ctx, legacy, replacement, retained };
}
