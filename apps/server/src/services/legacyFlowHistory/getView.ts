import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { get } from "./get.ts";
import { projectView } from "./projectView.ts";

export const getView = async (ctx: ServiceCtx, tx: Tx, input: { id: string }) => {
	const record = await get(ctx, tx, input);
	// PostgreSQL retains JSONB serialization, not the original request whitespace. Hash it before normalization.
	const [source] = await rows<{ document: string }>(
		tx,
		sql`SELECT doc::text AS document FROM flow_executions WHERE id=${input.id}`,
	);
	return projectView(record, source!.document);
};
