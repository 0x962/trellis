import { SearchQuerySchema } from "@trellis/api";
import type { ServiceCtx } from "../context.ts";
import { search } from "../db/queries/search.ts";
import type { Tx } from "../db/tx.ts";
import { searchPages } from "./pages";
import { resolveProject } from "./refs.ts";

export const query = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = SearchQuerySchema.parse(rawInput);
	const projectIds = input.project === undefined ? undefined : [(await resolveProject(ctx, tx, input.project)).id];
	const rankProjectIds =
		input.rankProject === undefined ? undefined : [(await resolveProject(ctx, tx, input.rankProject)).id];
	const options = { q: input.q, projectIds, rankProjectIds, limit: input.limit + 1, offset: input.offset };
	const core = await search(tx, options);
	const pages = await searchPages(ctx, tx, options);
	const hasMore = [core.tickets, core.projects, pages].some((items) => items.length > input.limit);
	return {
		tickets: core.tickets.slice(0, input.limit),
		projects: core.projects.slice(0, input.limit),
		pages: pages.slice(0, input.limit),
		nextOffset: hasMore ? input.offset + input.limit : null,
	};
};
