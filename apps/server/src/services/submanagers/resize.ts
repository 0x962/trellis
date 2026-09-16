import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { CapacityObservation } from "../assignments/occupiesSlot/index.ts";
import { requireParent } from "./access.ts";
import { getDelegation, usage } from "./queries.ts";

export const resize = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { id: string; capacity: number } & CapacityObservation,
) => {
	const delegation = await requireParent(ctx, tx, input.id);
	const own = await usage(tx, { ...delegation, sessions: input.sessions });
	if (input.capacity < own.activeWorkers + own.childCapacity)
		throw invalidInput("capacity", "The budget must cover active workers and child reservations.");
	const parent = await getDelegation(tx, delegation.parentRunId);
	if (parent) {
		const counts = await usage(tx, { ...parent, sessions: input.sessions });
		if (counts.activeWorkers + counts.childCapacity - delegation.capacity + input.capacity > parent.capacity)
			throw invalidInput("capacity", "The parent has no unreserved capacity for this budget.");
	}
	await tx.execute(sql`UPDATE manager_delegations SET capacity=${input.capacity} WHERE run_id=${input.id}`);
	return { ...delegation, capacity: input.capacity };
};
