import type { Session } from "@trellis/api";
import type { Tx } from "../../db/tx.ts";
import { saveRequestedName } from "../sessions";
import type { IoCtx } from "../support.ts";
import type { PreparedSessionName } from "./firstMessageName";

export async function saveNameFromFirstMessage(
	ctx: IoCtx,
	tx: Tx,
	input: PreparedSessionName,
): Promise<Session | null> {
	if (input === null) return null;
	const fields = { session: input.sessionId, run: input.runId };
	const saved = await saveRequestedName(ctx.core, tx, { id: input.sessionId, name: input.name });
	ctx.log("session name renamed", { ...fields, saved: saved !== null });
	return saved;
}
