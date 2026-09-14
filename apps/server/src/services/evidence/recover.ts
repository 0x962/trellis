import { sql } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";

export const recover = async (ctx: Pick<RequestContext, "now">, tx: Tx) => {
	await tx.execute(
		sql`UPDATE evidence_checks SET document = document || ${JSON.stringify({ state: "unknown", error: "The host stopped before it recorded the check launch result. Run a new check explicitly.", finishedAt: ctx.now.toISOString() })}::jsonb, finished_at = ${ctx.now} WHERE finished_at IS NULL AND document->>'state' = 'starting'`,
	);
	return {};
};
