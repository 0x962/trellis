import type { Status } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { iso, rows } from "./support.ts";

export type StatusRow = Status;

type RawStatus = {
	id: string;
	project_id: string;
	slug: string;
	name: string;
	category: Status["category"];
	reviewer: Status["reviewer"];
	color: Status["color"];
	position: number;
	wip_limit: number | null;
	is_default: boolean;
	created_at: string;
	updated_at: string;
};

export const statusColumns = sql`s.id, s.project_id, s.slug, s.name, s.category, s.reviewer, s.color,
	s.position, s.wip_limit, s.is_default, ${iso(sql`s.created_at`)} AS created_at, ${iso(sql`s.updated_at`)} AS updated_at`;

export const toStatus = (row: RawStatus): StatusRow => ({
	id: row.id,
	projectId: row.project_id,
	slug: row.slug,
	name: row.name,
	category: row.category,
	reviewer: row.reviewer,
	color: row.color,
	position: row.position,
	wipLimit: row.wip_limit,
	isDefault: row.is_default,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

// The chain from a project up to its root, nearest first. The walk stops
// at depth 64: the schema refuses parent_id = id and nothing else, so a
// planted two-node cycle ends here instead of running forever.
const chainCte = (projectId: string) => sql`chain AS (
	SELECT id, parent_id, 0 AS depth FROM projects WHERE id = ${projectId}
	UNION ALL
	SELECT p.id, p.parent_id, chain.depth + 1
	FROM projects p JOIN chain ON p.id = chain.parent_id
	WHERE chain.depth < 64
)`;

const ownerSelect = sql`SELECT chain.id FROM chain
	WHERE EXISTS (SELECT 1 FROM statuses s WHERE s.project_id = chain.id)
	ORDER BY chain.depth LIMIT 1`;

// owner(P): the nearest ancestor-or-self of P that owns statuses. Null only
// when no ancestor owns statuses, which the root seed rules out.
export const ownerOf = async (tx: Tx, projectId: string) => {
	const found = await rows<{ id: string }>(tx, sql`WITH RECURSIVE ${chainCte(projectId)} ${ownerSelect}`);
	return found[0]?.id ?? null;
};

// The statuses a project works with: its own set, or the set of owner(P),
// in position order.
export const effectiveStatuses = async (tx: Tx, projectId: string) => {
	const found = await rows<RawStatus>(
		tx,
		sql`WITH RECURSIVE ${chainCte(projectId)}, owner AS (${ownerSelect})
			SELECT ${statusColumns} FROM statuses s
			WHERE s.project_id = (SELECT id FROM owner)
			ORDER BY s.position, s.id`,
	);
	return found.map(toStatus);
};
