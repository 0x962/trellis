import { EpicChatterInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { resolveEpic } from "../../epics/resolve.ts";

export const get = async (ctx: ServiceCtx, tx: Tx, value: unknown) => {
	const input = EpicChatterInputSchema.parse(value);
	const epic = await resolveEpic(ctx, tx, input.epic);
	const [settings] = await rows<{ enabled: boolean }>(
		tx,
		sql`SELECT coalesce(s.enabled, true) AS enabled FROM epics e
		LEFT JOIN epic_chatter_settings s ON s.epic_id=e.id WHERE e.id=${epic.id}`,
	);
	return { epicId: epic.id, enabled: settings!.enabled };
};
