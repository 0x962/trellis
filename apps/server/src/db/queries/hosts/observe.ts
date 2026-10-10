import { sql } from "drizzle-orm";
import type { HostObservationResult } from "../../tables/hosts/index.ts";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";
import { type HostObservationRow, jsonbParam, observationColumns } from "./hostRow.ts";

export type RecordObservationInput = {
	hostId: string;
	observedAt: Date;
	result: HostObservationResult;
	observedIdentity?: string | null;
	protocol?: number | null;
	capabilities?: Record<string, unknown>;
	detail?: string | null;
};

// The table holds one row per host, so a new observation replaces the last.
export const recordObservation = async (tx: Tx, input: RecordObservationInput): Promise<HostObservationRow> => {
	const found = await rows<HostObservationRow>(
		tx,
		sql`
		WITH o AS (
			INSERT INTO host_observations
				(host_id, observed_at, result, observed_identity, protocol, capabilities, detail)
			VALUES (
				${input.hostId}, ${input.observedAt}, ${input.result}, ${input.observedIdentity ?? null},
				${input.protocol ?? null}, ${jsonbParam(input.capabilities ?? {})}, ${input.detail ?? null}
			)
			ON CONFLICT (host_id) DO UPDATE SET
				observed_at = EXCLUDED.observed_at,
				result = EXCLUDED.result,
				observed_identity = EXCLUDED.observed_identity,
				protocol = EXCLUDED.protocol,
				capabilities = EXCLUDED.capabilities,
				detail = EXCLUDED.detail
			RETURNING *
		)
		SELECT ${observationColumns} FROM o
	`,
	);
	return found[0]!;
};
