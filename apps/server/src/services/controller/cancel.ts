import { sql } from "drizzle-orm";
import { type RequestContext, requireActor } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { columns } from "./columns.ts";
import type { Dispatch } from "./types.ts";

export const cancel = async (
	ctx: RequestContext,
	tx: Tx,
	input: { id: string; expectedGeneration: number; reason: string },
): Promise<Dispatch> => {
	const actor = requireActor(ctx);
	if (actor.kind !== "human") throw invalidInput("actor", "A person must cancel an unknown manager delivery.");
	const resolution = {
		kind: "cancelled",
		receipt: "unknown",
		generation: input.expectedGeneration,
		reason: input.reason,
		actor,
		at: ctx.now.toISOString(),
	};
	const [changed] = await rows<Dispatch>(
		tx,
		sql`UPDATE manager_dispatches SET state='cancelled',resolution=${JSON.stringify(resolution)}::jsonb,updated_at=${ctx.now}
		WHERE id=${input.id} AND generation=${input.expectedGeneration} AND state='unknown' AND resolution IS NULL RETURNING ${columns}`,
	);
	if (!changed)
		throw invalidInput(
			"expectedGeneration",
			`Delivery ${input.id} is no longer unknown at generation ${input.expectedGeneration}. Refresh the queue before another action.`,
		);
	return changed;
};
