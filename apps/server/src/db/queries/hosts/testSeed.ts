import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "../../client.ts";

const now = new Date("2026-10-10T16:00:00.000Z");

// An agent run and a project with one status, written with raw SQL so the
// column default `local_host_id()` applies when the caller names no host.
export const seedRun = async (db: Db, hostId?: string) => {
	const id = ulid();
	const column = hostId === undefined ? sql`` : sql`, host_id`;
	const value = hostId === undefined ? sql`` : sql`, ${hostId}`;
	await db.execute(sql`
		INSERT INTO agent_runs (id, name, kind, instruction, project_key, created_at, updated_at${column})
		VALUES (${id}, 'Run', 'session', 'Work', '', ${now}, ${now}${value})
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
