import type { Tx } from "../../db/tx.ts";
import { collectHeartbeats } from "./collectHeartbeats.ts";
import { collect as collectNextActions } from "./nextActions/collect.ts";
import type { ControllerCtx, ControllerInput } from "./types.ts";

export const collect = async (ctx: ControllerCtx, tx: Tx, input: ControllerInput) => {
	await collectNextActions(ctx, tx);
	await collectHeartbeats(ctx, tx, input);
	return {};
};
