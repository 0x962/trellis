import type { Tx } from "../../../db/tx.ts";
import type { IoCtx } from "../../support.ts";

export const finishSessionObserverRecovery = (_ctx: IoCtx, _tx: Tx, input: { recovered: number }) =>
	Promise.resolve(input);
