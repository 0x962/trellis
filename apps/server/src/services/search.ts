import { SearchQuerySchema } from "@trellis/api";
import type { ServiceCtx } from "../context.ts";
import { search } from "../db/queries/search.ts";
import type { Tx } from "../db/tx.ts";
import { searchPages } from "./pages/search.ts";
import { resolveProject } from "./refs.ts";

// A project ref narrows the ticket, Page, and project results to one project.
export const query = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = SearchQuerySchema.parse(rawInput);
	const projectIds = input.project === undefined ? undefined : [(await resolveProject(ctx, tx, input.project)).id];
	const rankProjectIds =
		input.rankProject === undefined ? undefined : [(await resolveProject(ctx, tx, input.rankProject)).id];
	const core = await search(tx, { q: input.q, projectIds, rankProjectIds, limit: input.limit });
	const pages = await searchPages(ctx, tx, { q: input.q, projectIds, rankProjectIds, limit: input.limit });
	return { ...core, pages };
};
