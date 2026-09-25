import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { diskPageHashes, sweepPageTemp } from "../../../storage/pageObjects.ts";
import type { ServiceCtx } from "../../support.ts";
import { collectUnheldPageObjects } from "../objects";
import { PAGE_RETENTION_MS } from "../rows.ts";

export const purgeExpiredPages = async (ctx: ServiceCtx, tx: Tx, _input: Record<string, never>) => {
	const now = ctx.now();
	const purged = await rows<{ id: string }>(
		tx,
		sql`DELETE FROM pages
		WHERE deleted_at <= ${new Date(now.getTime() - PAGE_RETENTION_MS)} RETURNING id`,
	);
	const expired = await rows<{ id: string }>(tx, sql`DELETE FROM page_uploads WHERE expires_at <= ${now} RETURNING id`);
	ctx.afterCommit(async () => {
		const collected = await collectUnheldPageObjects(ctx, await diskPageHashes(ctx.home));
		const removedTemp = await sweepPageTemp(ctx.home);
		ctx.log("page sweep", {
			purgedPages: purged.length,
			expiredUploads: expired.length,
			removedObjects: collected.removed.length,
			removedTemp,
		});
	});
	return { purgedPages: purged.length, expiredUploads: expired.length };
};
