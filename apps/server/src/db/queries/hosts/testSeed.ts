import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "../../client.ts";

const now = new Date("2026-10-10T16:00:00.000Z");

// Rows written with raw SQL. An undefined `hostId` leaves `host_id` out of
// the INSERT, so the column default `local_host_id()` applies.
const hostClause = (hostId?: string) =>
	hostId === undefined ? { column: sql``, value: sql`` } : { column: sql`, host_id`, value: sql`, ${hostId}` };

export const seedRun = async (db: Db, hostId?: string) => {
	const id = ulid();
	const host = hostClause(hostId);
	await db.execute(sql`
		INSERT INTO agent_runs (id, name, kind, instruction, project_key, created_at, updated_at${host.column})
		VALUES (${id}, 'Run', 'session', 'Work', '', ${now}, ${now}${host.value})
	`);
	return id;
};

export const seedAttempt = async (db: Db, runId: string, hostId?: string) => {
	const id = ulid();
	const host = hostClause(hostId);
	await db.execute(sql`
		INSERT INTO agent_execution_attempts (id, run_id, generation, token_hash, created_at${host.column})
		VALUES (${id}, ${runId}, 1, ${`hash-${id}`}, ${now}${host.value})
	`);
	return id;
};

export const seedProject = async (db: Db, hostId: string | null) => {
	const id = ulid();
	const key = `P${id.slice(-5)}`;
	await db.execute(sql`
		INSERT INTO projects (id, key, slug, name, default_host_id, created_at, updated_at)
		VALUES (${id}, ${key}, ${key.toLowerCase()}, 'Project', ${hostId}, ${now}, ${now})
	`);
	const statusId = ulid();
	await db.execute(sql`
		INSERT INTO statuses (id, project_id, name, slug, category, color, position, created_at, updated_at)
		VALUES (${statusId}, ${id}, 'Todo', 'todo', 'todo', 'gray', 0, ${now}, ${now})
	`);
	return { id, statusId };
};

export const seedTicket = async (db: Db, project: { id: string; statusId: string }, hostId: string | null) => {
	const id = ulid();
	await db.execute(sql`
		INSERT INTO tickets (id, project_id, number, title, status_id, position, host_id, created_at, updated_at)
		VALUES (${id}, ${project.id}, 1, 'Ticket', ${project.statusId}, 1024, ${hostId}, ${now}, ${now})
	`);
	return id;
};

export const seedFlow = async (db: Db, ticketId: string, projectId: string, hostId?: string) => {
	const id = ulid();
	const host = hostClause(hostId);
	await db.execute(sql`
		INSERT INTO flow_executions
			(id, flow_id, ticket_id, project_id, actor_kind, actor_name, request_id, request, doc, state, revision,
			 created_at, updated_at${host.column})
		VALUES (${id}, 'flow', ${ticketId}, ${projectId}, 'human', 'tester', ${ulid()}, '{}', '{}', '{}', 1,
			${now}, ${now}${host.value})
	`);
	return id;
};

export const seedAccount = async (db: Db, profilePath: string, hostId?: string) => {
	const id = ulid();
	const host = hostClause(hostId);
	await db.execute(sql`
		INSERT INTO harness_accounts (id, name, harness, profile_path, created_at, updated_at${host.column})
		VALUES (${id}, 'Account', 'claude', ${profilePath}, ${now}, ${now}${host.value})
	`);
	return id;
};

export const seedProjectPath = async (db: Db, projectId: string, hostId: string) => {
	await db.execute(sql`
		INSERT INTO project_host_paths (project_id, host_id, directory, created_at, updated_at)
		VALUES (${projectId}, ${hostId}, '/repos/project', ${now}, ${now})
	`);
};
