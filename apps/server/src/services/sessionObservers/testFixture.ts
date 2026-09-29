import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";

export const at = new Date("2026-09-29T16:00:00.000Z");

export const context = (events: TrellisEvent[], now = at): ServiceCtx => ({
	actor: { kind: "human", name: "Navid" },
	session: null,
	reqId: ulid(),
	now,
	emit: (event) => events.push(event),
	cache: createCache(),
	actorCache: new Map(),
	dropBlobs: () => {},
	publicUrl: "http://127.0.0.1:4521",
});

export const seed = async () => {
	const db = await openTestDb();
	const projectId = ulid();
	const statusId = ulid();
	const ticketId = ulid();
	const ticketRunId = ulid();
	const standaloneRunId = ulid();
	const standaloneSessionId = ulid();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'OBS', 'observers', 'Observers', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ticketId}, ${projectId}, 1, 'Observed ticket', ${statusId}, 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier, created_at, updated_at)
		VALUES
		(${ticketRunId}, 'Ticket worker', 'agent', 'Work.', ${projectId}, 'OBS', ${ticketId}, 'OBS-1', ${at}, ${at}),
		(${standaloneRunId}, 'Standalone worker', 'session', 'Work.', NULL, '', NULL, NULL, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
		VALUES (${standaloneSessionId}, 'Observer session', '/tmp/observer-session', '{"preset":"codex"}'::jsonb,
		${standaloneRunId}, ${at}, ${at})`);
	return { db, standaloneRunId, standaloneSessionId, ticketRunId };
};
