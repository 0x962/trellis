import { type SessionObserver, type SessionObserverGetInput, SessionObserverGetInputSchema } from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveSessionUpdateOwner } from "../sessionUpdates/owner.ts";
import { readSessionObserver } from "./queries.ts";

export const get = async (_ctx: ServiceCtx, tx: Tx, value: SessionObserverGetInput): Promise<SessionObserver> => {
	const input = SessionObserverGetInputSchema.parse(value);
	const owner = await resolveSessionUpdateOwner(tx, input.sessionId);
	return readSessionObserver(tx, owner.runId);
};
