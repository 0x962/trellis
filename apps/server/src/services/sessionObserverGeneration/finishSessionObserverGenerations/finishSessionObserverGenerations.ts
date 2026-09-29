import type { Tx } from "../../../db/tx.ts";
import type { IoCtx } from "../../support.ts";

export const finishSessionObserverGenerations = (
	_ctx: IoCtx,
	_tx: Tx,
	input: { checked: number; saved: number; failed: number },
) => Promise.resolve(input);
