import type { AgentPing } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { iso, rows } from "./support.ts";

// The heartbeat writes one row per PING it sent to a project's manager. A
// 15 second interval writes 5760 rows a day, so `insertPing` deletes the
// rows of that project below the newest PING_HISTORY and the table stays
// this size.

export const PING_HISTORY = 200;

type RawPing = { id: number; project_id: string; at: string; restarted: boolean };

const columns = sql`id, project_id, ${iso(sql`at`)} AS at, restarted`;

const toPing = (raw: RawPing): AgentPing => ({
	id: raw.id,
	projectId: raw.project_id,
	at: raw.at,
	restarted: raw.restarted,
});

export type PingInsert = { projectId: string; at: Date; restarted: boolean };

export const insertPing = async (tx: Tx, input: PingInsert): Promise<AgentPing> => {
	const [written] = await rows<RawPing>(
		tx,
		sql`INSERT INTO agent_pings (project_id, at, restarted)
			VALUES (${input.projectId}, ${input.at}, ${input.restarted})
			RETURNING ${columns}`,
	);
	await tx.execute(sql`
		DELETE FROM agent_pings WHERE project_id = ${input.projectId} AND id NOT IN (
			SELECT id FROM agent_pings WHERE project_id = ${input.projectId} ORDER BY id DESC LIMIT ${PING_HISTORY}
		)
	`);
	return toPing(written!);
};

// The newest pings of one project first.
export const recentPings = async (tx: Tx, input: { projectId: string; limit: number }): Promise<AgentPing[]> =>
	(
		await rows<RawPing>(
			tx,
			sql`SELECT ${columns} FROM agent_pings WHERE project_id = ${input.projectId}
				ORDER BY id DESC LIMIT ${input.limit}`,
		)
	).map(toPing);
