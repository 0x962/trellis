import type { ProjectColor } from "@trellis/api";
import { sql } from "drizzle-orm";
import { type StatusRow, statusColumns, toStatus } from "./queries/effectiveStatuses.ts";
import { iso, rows } from "./queries/support.ts";
import type { Tx } from "./tx.ts";

export type CachedProject = {
	id: string;
	parentId: string | null;
	rootId: string;
	key: string | null;
	slug: string;
	name: string;
	position: number;
	color: ProjectColor | null;
	archivedAt: string | null;
};

type RawProject = {
	id: string;
	parent_id: string | null;
	root_id: string;
	key: string | null;
	slug: string;
	name: string;
	position: number;
	color: ProjectColor | null;
	archived_at: string | null;
};

export type EffectiveStatuses = { ownerId: string; statuses: StatusRow[] };

export type ProjectCache = ReturnType<typeof createCache>;

// The project tree and every status set in memory. `rebuild` reads both
// tables in one transaction; until the next rebuild every answer comes from
// that snapshot, so a service that changes projects or statuses calls
// `rebuild` after its commit. Siblings sort by (position, slug) and a
// subtree lists parents before children.
export const createCache = () => {
	let projects = new Map<string, CachedProject>();
	let children = new Map<string, CachedProject[]>();
	let roots = new Map<string, CachedProject>();
	let owned = new Map<string, StatusRow[]>();

	const rebuild = async (tx: Tx) => {
		const projectRows = await rows<RawProject>(
			tx,
			sql`SELECT id, parent_id, root_id, key, slug, name, position, color, ${iso(sql`archived_at`)} AS archived_at
				FROM projects ORDER BY position, slug`,
		);
		const statusRows = await rows<Parameters<typeof toStatus>[0]>(
			tx,
			sql`SELECT ${statusColumns} FROM statuses s ORDER BY s.position, s.id`,
		);
		projects = new Map();
		children = new Map();
		roots = new Map();
		owned = new Map();
		for (const row of projectRows) {
			const project: CachedProject = {
				id: row.id,
				parentId: row.parent_id,
				rootId: row.root_id,
				key: row.key,
				slug: row.slug,
				name: row.name,
				position: row.position,
				color: row.color,
				archivedAt: row.archived_at,
			};
			projects.set(project.id, project);
			if (project.parentId === null) roots.set((project.key as string).toUpperCase(), project);
			else children.set(project.parentId, [...(children.get(project.parentId) ?? []), project]);
		}
		for (const row of statusRows) {
			const status = toStatus(row);
			owned.set(status.projectId, [...(owned.get(status.projectId) ?? []), status]);
		}
	};

	const get = (projectId: string) => projects.get(projectId) as CachedProject;

	// The project and every descendant, parents first.
	const resolveSubtree = (projectId: string): string[] => [
		projectId,
		...(children.get(projectId) ?? []).flatMap((child) => resolveSubtree(child.id)),
	];

	// `KEY.slug.slug` in any letter case to a project id; null when a
	// segment names nothing.
	const resolvePath = (path: string): string | null => {
		const [key, ...slugs] = path.split(".");
		let current = roots.get((key as string).toUpperCase());
		for (const slug of slugs) {
			if (current === undefined) return null;
			current = (children.get(current.id) ?? []).find((child) => child.slug === slug.toLowerCase());
		}
		return current?.id ?? null;
	};

	// owner(P) and its statuses: the nearest ancestor-or-self with a set.
	const effectiveStatuses = (projectId: string): EffectiveStatuses => {
		let current: CachedProject | undefined = get(projectId);
		while (current !== undefined) {
			const statuses = owned.get(current.id);
			if (statuses !== undefined) return { ownerId: current.id, statuses };
			current = current.parentId === null ? undefined : projects.get(current.parentId);
		}
		throw new Error(`No status owner above project ${projectId}.`);
	};

	return { rebuild, get, resolveSubtree, resolvePath, effectiveStatuses };
};
