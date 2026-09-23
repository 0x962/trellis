import { sql } from "drizzle-orm";
import { type StatusRow, statusColumns, toStatus } from "./queries/effectiveStatuses.ts";
import { iso, rows } from "./queries/support.ts";
import type { Tx } from "./tx.ts";

export type CachedProject = {
	id: string;
	key: string;
	slug: string;
	name: string;
	position: number;
	archivedAt: string | null;
};

type RawProject = {
	id: string;
	key: string;
	slug: string;
	name: string;
	position: number;
	archived_at: string | null;
};

export type ProjectCache = ReturnType<typeof createCache>;

// Every project and every status set in memory. `rebuild` reads both tables
// in one transaction; until the next rebuild every answer comes from that
// snapshot, so a service that changes projects or statuses calls `rebuild`
// after its commit. Projects sort by (position, slug).
export const createCache = () => {
	let projects = new Map<string, CachedProject>();
	let byKey = new Map<string, CachedProject>();
	let bySlug = new Map<string, CachedProject>();
	let owned = new Map<string, StatusRow[]>();

	const rebuild = async (tx: Tx) => {
		const projectRows = await rows<RawProject>(
			tx,
			sql`SELECT id, key, slug, name, position, ${iso(sql`archived_at`)} AS archived_at
				FROM projects ORDER BY position, slug`,
		);
		const statusRows = await rows<Parameters<typeof toStatus>[0]>(
			tx,
			sql`SELECT ${statusColumns} FROM statuses s ORDER BY s.position, s.id`,
		);
		projects = new Map();
		byKey = new Map();
		bySlug = new Map();
		owned = new Map();
		for (const row of projectRows) {
			const project: CachedProject = {
				id: row.id,
				key: row.key,
				slug: row.slug,
				name: row.name,
				position: row.position,
				archivedAt: row.archived_at,
			};
			projects.set(project.id, project);
			byKey.set(project.key.toUpperCase(), project);
			bySlug.set(project.slug, project);
		}
		for (const row of statusRows) {
			const status = toStatus(row);
			owned.set(status.projectId, [...(owned.get(status.projectId) ?? []), status]);
		}
	};

	const get = (projectId: string) => projects.get(projectId) as CachedProject;

	// A key, then a slug, in any letter case, to a project id. Null when the
	// value names no project.
	const resolveRef = (value: string): string | null =>
		byKey.get(value.toUpperCase())?.id ?? bySlug.get(value.toLowerCase())?.id ?? null;

	// The statuses of a project, in position order.
	const statusesOf = (projectId: string): StatusRow[] => {
		const statuses = owned.get(projectId);
		if (statuses === undefined) throw new Error(`Project ${projectId} owns no status.`);
		return statuses;
	};

	return { rebuild, get, resolveRef, statusesOf };
};
