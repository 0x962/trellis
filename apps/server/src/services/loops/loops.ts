import type { LoopAction } from "@trellis/api";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { IoCtx } from "../support.ts";
import { loopRuntimes } from "./runtime.ts";

export const list = async (ctx: IoCtx, _tx: Tx) => {
	const loop = loopRuntimes.get(ctx.home);
	return loop ? [loop.read()] : [];
};
export const control = async (ctx: IoCtx, _tx: Tx, input: { action: LoopAction }) => {
	if (ctx.core.actor?.kind !== "human") throw invalidInput("actor", "Only a person can control loops.");
	const loop = loopRuntimes.get(ctx.home)!;
	if (input.action === "run") loop.runNow();
	else if (input.action === "pause") loop.pause();
	else if (input.action === "resume") loop.resume();
	else loop.clear();
	return loop.read();
};
