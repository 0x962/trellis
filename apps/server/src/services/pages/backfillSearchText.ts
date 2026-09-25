import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { pageObjectPath } from "../../storage/pageObjects.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { staticPageText } from "./content.ts";

export const PAGE_SEARCH_BACKFILL_BATCH_SIZE = 4;

type SearchBackfillRow = {
	page_id: string;
	number: number;
	document_sha256: string;
};

type PreparedSearchBackfill = {
	entries: Array<{ pageId: string; number: number; searchText: string }>;
	pending: boolean;
};

export const prepareSearchBackfill = async (ctx: IoCtx & PrepareCtx): Promise<PreparedSearchBackfill> => {
	const found = await ctx.newTx((tx) =>
		rows<SearchBackfillRow>(
			tx,
			sql`SELECT version.page_id, version.number, version.document_sha256
				FROM page_versions version
				JOIN pages page ON page.id = version.page_id AND page.latest_version = version.number
				WHERE version.search_indexed = false
				ORDER BY version.page_id
				LIMIT ${PAGE_SEARCH_BACKFILL_BATCH_SIZE + 1}`,
		),
	);
	const entries = await Promise.all(
		found.slice(0, PAGE_SEARCH_BACKFILL_BATCH_SIZE).map(async (row) => ({
			pageId: row.page_id,
			number: row.number,
			searchText: staticPageText(await Bun.file(pageObjectPath(ctx.home, row.document_sha256)).text()),
		})),
	);
	return { entries, pending: found.length > PAGE_SEARCH_BACKFILL_BATCH_SIZE };
};

export const backfillSearchText = async (_ctx: IoCtx, tx: Tx, prepared: PreparedSearchBackfill) => {
	let updated = 0;
	for (const entry of prepared.entries) {
		const changed = await rows<{ page_id: string }>(
			tx,
			sql`UPDATE page_versions version
				SET search_text = ${entry.searchText}, search_indexed = true
				FROM pages page
				WHERE version.page_id = ${entry.pageId} AND version.number = ${entry.number}
					AND version.search_indexed = false
					AND page.id = version.page_id AND page.latest_version = version.number
				RETURNING version.page_id`,
		);
		updated += changed.length;
	}
	return { updated, pending: prepared.pending };
};
