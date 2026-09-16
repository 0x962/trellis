import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { type SQL, sql } from "drizzle-orm";

export type CapacityObservation = { sessions?: RuntimeProcessStatus[] };

// A reserved attempt can lack a runtime record or an initial prompt receipt.
// Unknown attempts retain capacity until the runtime confirms that work stopped.
export const occupiesSlot = (terminalId: SQL, { sessions = [] }: CapacityObservation) => {
	const inactive = sessions
		.filter(
			(session) =>
				session.status === "exited" ||
				(session.status === "running" &&
					session.controllable &&
					((session.activity?.state === "idle" && session.acknowledgedMessageIds.includes(session.id)) ||
						session.agent?.outcome != null)),
		)
		.map((session) => session.id);
	return sql`(${terminalId} IS NULL OR ${terminalId} NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(inactive)}::jsonb)))`;
};
