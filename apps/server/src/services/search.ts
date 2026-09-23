import { SearchQuerySchema } from "@trellis/api";
import type { ServiceCtx } from "../context.ts";
import { search } from "../db/queries/search.ts";
import type { Tx } from "../db/tx.ts";
import { resolveProject } from "./refs.ts";

// One search over tickets and projects. A project ref narrows both lists to
// that project.
export const query = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = SearchQuerySchema.parse(rawInput);
	const projectIds = input.project === undefined ? undefined : [(await resolveProject(ctx, tx, input.project)).id];
	const rankProjectIds =
		input.rankProject === undefined ? undefined : [(await resolveProject(ctx, tx, input.rankProject)).id];
	return search(tx, { q: input.q, projectIds, rankProjectIds, limit: input.limit });
};
