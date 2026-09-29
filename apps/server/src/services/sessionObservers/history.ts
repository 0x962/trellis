import {
	type SessionObserverHistory,
	type SessionObserverHistoryInput,
	SessionObserverHistoryInputSchema,
} from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveSessionUpdateOwner } from "../sessionUpdates/owner.ts";
import { readSessionObserverHistory } from "./queries.ts";

export const history = async (
	_ctx: ServiceCtx,
	tx: Tx,
	value: SessionObserverHistoryInput,
): Promise<SessionObserverHistory> => {
	const input = SessionObserverHistoryInputSchema.parse(value);
	const owner = await resolveSessionUpdateOwner(tx, input.sessionId);
	return readSessionObserverHistory(tx, owner.runId);
};
