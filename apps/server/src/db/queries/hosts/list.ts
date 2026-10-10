import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";
import { type HostObservationRow, type HostRow, hostColumns, observationColumns } from "./hostRow.ts";

export type HostListRow = HostRow & { observation: HostObservationRow | null };

// Every active host, with its latest observation. `includeRetired` adds the
// retired and the revoked hosts. The local host sorts first.
export const listHosts = async (tx: Tx, input: { includeRetired?: boolean } = {}): Promise<HostListRow[]> => {
	const filter = input.includeRetired === true ? sql`true` : sql`h.state = 'active'`;
	return rows<HostListRow>(
		tx,
		sql`
		SELECT ${hostColumns},
			(SELECT to_jsonb(observation) FROM (SELECT ${observationColumns} FROM host_observations o WHERE o.host_id = h.id) observation) AS observation
		FROM hosts h
		WHERE ${filter}
		ORDER BY h.local DESC, h.name, h.id
	`,
	);
};
