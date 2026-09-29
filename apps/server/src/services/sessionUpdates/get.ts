import { type SessionUpdatesGetInput, SessionUpdatesGetInputSchema } from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveSessionUpdateOwner } from "./owner.ts";
import { getSessionUpdates } from "./queries.ts";

export const get = async (_ctx: ServiceCtx, tx: Tx, value: SessionUpdatesGetInput) => {
	const input = SessionUpdatesGetInputSchema.parse(value);
	const owner = await resolveSessionUpdateOwner(tx, input.sessionId);
	return getSessionUpdates(tx, { runId: owner.runId, history: input.history });
};
