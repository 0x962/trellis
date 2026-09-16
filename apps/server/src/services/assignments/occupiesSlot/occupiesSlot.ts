import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { type SQL, sql } from "drizzle-orm";

export type CapacityObservation = { sessions?: RuntimeProcessStatus[] };

// Short turns do not consume the worker budget. Each runtime observation measures continuous work at its own check time.
export const occupiesSlot = (terminalId: SQL, { sessions = [] }: CapacityObservation) => {
	const active = sessions
		.filter(
			(session) =>
				session.status === "running" &&
				session.controllable &&
				session.agent?.outcome == null &&
				session.activity?.state === "working" &&
				session.activity.workingSince !== undefined &&
				Date.parse(session.checkedAt) - Date.parse(session.activity.workingSince) >= 10_000,
		)
		.map((session) => session.id);
	return sql`${terminalId} IN (SELECT jsonb_array_elements_text(${JSON.stringify(active)}::jsonb))`;
};
