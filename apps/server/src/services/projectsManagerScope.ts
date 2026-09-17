import { activityActions } from "@trellis/api";
import type { ServiceCtx } from "../context.ts";
import type { Tx } from "../db/tx.ts";
import { projectActivity } from "./projectRows.ts";
import { pathOf } from "./refs.ts";

// A sub-project with its own manager instruction is outside the scope of every
// manager above it: the controller sends its ticket events to its own
// manager only. This writes the one row that tells the managers above about
// that scope change. The row sits on the direct parent project with a null
// ticket, and `to_value` and `meta.projectId` name the sub-project. The
// controller collects a parent row into the dispatch of the nearest manager
// above, because an unmanaged parent stays inside that manager's scope. A
// root project and an instruction edit write no row. Call
// this after `ctx.cache.rebuild`, so `pathOf` reads the current slug.
export const recordManagerScopeChange = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { projectId: string; parentId: string | null; before: boolean; after: boolean },
) => {
	if (input.parentId === null || input.before === input.after) return;
	const action = input.after ? activityActions.subprojectManagerEnabled : activityActions.subprojectManagerDisabled;
	await projectActivity(ctx, tx, input.parentId, action, [
		{ field: null, from: null, to: pathOf(ctx.cache, input.projectId), meta: { projectId: input.projectId } },
	]);
};
