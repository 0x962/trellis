import { PageCommentListInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../context.ts";
import type { Tx } from "../../../../db/tx.ts";
import { fail } from "../../../../errors.ts";
import { resolvePage } from "../../pages.ts";
import { loadPageCommentThreads } from "../support";

export const listPageComments = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = PageCommentListInputSchema.parse(rawInput);
	const page = await resolvePage(ctx, tx, input.page, true);
	if (page.deleted_at !== null) throw fail("PAGE_DELETED");
	let where = sql`thread.page_id = ${page.id}`;
	if (input.version !== undefined) where = sql`${where} AND thread.version = ${input.version}`;
	if (input.resolved !== undefined)
		where = sql`${where} AND thread.resolved_at IS ${input.resolved ? sql`NOT NULL` : sql`NULL`}`;
	return loadPageCommentThreads(tx, where);
};
