import { SearchQuerySchema } from "@trellis/api";
import type { ServiceCtx } from "../context.ts";
import { search } from "../db/queries/search.ts";
import type { Tx } from "../db/tx.ts";
import { resolveProject } from "./refs.ts";

// One search over tickets and projects. A project ref narrows both lists
// to that project and its descendants.
export const query = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = SearchQuerySchema.parse(rawInput);
	const projectIds =
		input.project === undefined
			? undefined
			: ctx.cache.resolveSubtree((await resolveProject(ctx, tx, input.project)).id);
	return search(tx, { q: input.q, projectIds, limit: input.limit });
};
