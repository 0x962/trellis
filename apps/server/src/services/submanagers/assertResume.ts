import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { StoredRun } from "../agentRuns/queries.ts";
import { assertAssignmentOwner, requireParent } from "./access.ts";
import { getDelegation } from "./queries.ts";

export const assertResume = async (ctx: ServiceCtx, tx: Tx, run: StoredRun) => {
	const delegation = await getDelegation(tx, run.id);
	if (delegation) {
		if (delegation.retiredAt) throw invalidInput("id", "This submanager has retired. Start a new delegation.");
		await requireParent(ctx, tx, run.id);
	}
	if (run.ticketId) await assertAssignmentOwner(ctx, tx, run.projectId!);
};
