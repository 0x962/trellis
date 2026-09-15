import type { Tx } from "../../db/tx.ts";
import { readRuntimeSessions } from "../agentRuns/liveState.ts";
import type { ServiceCtx } from "../support.ts";
import { collect as collectEvents } from "./collect.ts";
import { claim as claimDispatch } from "./controller.ts";
import type { ControllerInput } from "./types.ts";

export const prepare = async (ctx: ServiceCtx): Promise<ControllerInput> => ({
	sessions: await readRuntimeSessions(ctx.home),
});
export const collect = (ctx: ServiceCtx, tx: Tx, input: ControllerInput) =>
	collectEvents({ now: ctx.now() }, tx, input);
export const claim = (ctx: ServiceCtx, tx: Tx, input: ControllerInput) => claimDispatch({ now: ctx.now() }, tx, input);
