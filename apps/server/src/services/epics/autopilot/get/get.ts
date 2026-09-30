import { type EpicAutopilot, EpicRefInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../context.ts";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";
import { resolveEpic } from "../../resolve.ts";

export async function get(ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<EpicAutopilot | null> {
	const input = EpicRefInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx, tx, input.epic);
	const [row] = await rows<{ autopilot: EpicAutopilot | null }>(
		tx,
		sql`SELECT autopilot FROM epics WHERE id = ${epic.id}`,
	);
	return row!.autopilot;
}
