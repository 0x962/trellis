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
	description: string;
	category: Status["category"];
	color: Status["color"];
	position: number;
	is_default: boolean;
	created_at: string;
	updated_at: string;
};

export const statusColumns = sql`s.id, s.project_id, s.slug, s.name, s.description, s.category, s.color,
	s.position, s.is_default, ${iso(sql`s.created_at`)} AS created_at, ${iso(sql`s.updated_at`)} AS updated_at`;

export const toStatus = (row: RawStatus): StatusRow => ({
	id: row.id,
	projectId: row.project_id,
	description: row.description,
	slug: row.slug,
	name: row.name,
	category: row.category,
	color: row.color,
	position: row.position,
	isDefault: row.is_default,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

// The statuses of a project, in position order.
export const projectStatuses = async (tx: Tx, projectId: string) => {
	const found = await rows<RawStatus>(
		tx,
		sql`SELECT ${statusColumns} FROM statuses s WHERE s.project_id = ${projectId} ORDER BY s.position, s.id`,
	);
	return found.map(toStatus);
};
