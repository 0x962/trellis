import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { requireManager } from "./access.ts";
import { columns, type Delegation } from "./queries.ts";

export const list = async (ctx: ServiceCtx, tx: Tx) => {
	const parent = ctx.actor?.kind === "agent" ? await requireManager(ctx, tx) : null;
	return rows<Delegation>(
		tx,
		sql`SELECT ${columns} FROM manager_delegations
		WHERE retired_at IS NULL AND ${parent ? sql`parent_run_id=${parent.id} OR run_id=${parent.id}` : sql`true`} ORDER BY created_at,run_id`,
	);
};
