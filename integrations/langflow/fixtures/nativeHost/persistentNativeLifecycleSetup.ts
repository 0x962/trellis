import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { edge, node } from "../../../../apps/server/src/agents/nativeFlow/testDoc.ts";
import type { ServiceCtx as CoreCtx } from "../../../../apps/server/src/context.ts";
import { createCache } from "../../../../apps/server/src/db/cache.ts";
import { openDatabase } from "../../../../apps/server/src/db/open.ts";
import { start as startExecution } from "../../../../apps/server/src/services/flowExecutions/start.ts";
import { create as createFlow } from "../../../../apps/server/src/services/flows/flows.ts";
import { save as saveFlow } from "../../../../apps/server/src/services/flows/save.ts";
import { ensurePr } from "../../../../apps/server/src/services/reviews/queries.ts";
import { create as createTicket } from "../../../../apps/server/src/services/tickets/create.ts";
import { createBridgeReservationStore } from "./bridgeReservationFixture.ts";

const setupContext = async (db: Awaited<ReturnType<typeof openDatabase>>["db"], at: Date): Promise<CoreCtx> => {
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	return {
		actor: { kind: "agent", name: "Crash fixture" },
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
};

const writeJson = async (path: string, value: unknown) => {
	const temporary = `${path}-${crypto.randomUUID()}.next`;
	await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
	await rename(temporary, path);
};

export async function createPersistentNativeLifecycleFixture(home: string, humanFirst = false) {
	await mkdir(home, { recursive: true, mode: 0o700 });
	const database = await openDatabase(join(home, "db"));
	const at = new Date("2026-09-29T10:00:00.000Z");
	const projectId = ulid();
	const statusId = ulid();
	await database.db.execute(sql`INSERT INTO projects (id,key,slug,name,directory,created_at,updated_at)
		VALUES (${projectId},'CRS','crash-fixture','Crash fixture',${home},${at},${at})`);
	await database.db.execute(sql`INSERT INTO statuses
		(id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${statusId},${projectId},'Todo','todo','todo','fg-muted',0,true,${at},${at})`);
	const core = await setupContext(database.db, at);
	await database.db.transaction(createBridgeReservationStore);
	const flow = await database.db.transaction((tx) => createFlow(core, tx, { name: "Crash flow", project: projectId }));
	const doc = await database.db.transaction((tx) =>
		saveFlow(core, tx, {
			flow: flow.id,
			expectedVersion: flow.version,
			nodes: humanFirst ? [node("human", "human", null), node("agent", "agent", null)] : [node("agent", "agent", null)],
			edges: humanFirst ? [edge("human", "agent")] : [],
		}),
	);
	const ticket = await database.db.transaction((tx) =>
		createTicket(core, tx, { project: projectId, title: "Crash fixture" }),
	);
	const diff = await database.db.transaction((tx) => ensurePr(tx, `example/app#${ticket.number}`));
	await database.db.execute(
		sql`INSERT INTO ticket_pull_requests
		(ticket_id,pull_request_id,source,actor_name,actor_kind,created_at)
		VALUES (${ticket.id},${diff.id},'manual','Crash fixture','agent',${at})`,
	);
	const execution = await database.db.transaction((tx) =>
		startExecution(core, tx, {
			flow: flow.id,
			ticket: ticket.id,
			diffId: diff.id,
			headSha: "crash-fixture",
			expectedVersion: doc.flow.version,
			requestId: crypto.randomUUID(),
		}),
	);
	await writeJson(join(home, "fixture.json"), {
		executionId: execution.id,
		at: at.toISOString(),
	});
	await database.close();
	return { executionId: execution.id };
}
