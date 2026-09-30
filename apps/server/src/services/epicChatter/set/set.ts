import { EpicChatterSetInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { resolveEpic } from "../../epics/resolve.ts";
import { assertProjectActive } from "../../refs.ts";

export const set = async (ctx: ServiceCtx, tx: Tx, value: unknown) => {
	const input = EpicChatterSetInputSchema.parse(value);
	if (ctx.actor?.kind !== "human") throw invalidInput("enabled", "Only a person can change Chatter settings.");
	const epic = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, epic.project_id);
	await tx.execute(sql`INSERT INTO epic_chatter_settings (epic_id, enabled) VALUES (${epic.id}, ${input.enabled})
		ON CONFLICT (epic_id) DO UPDATE SET enabled=excluded.enabled`);
	ctx.emit({ type: "epic-chatter.changed", projectId: epic.project_id, id: epic.id });
	return { epicId: epic.id, enabled: input.enabled };
};
