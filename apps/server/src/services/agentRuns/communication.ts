import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { managedTerminal } from "../../agents/managedTerminal/managedTerminal.ts";
import { superset } from "../../agents/superset/superset.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { getRun } from "./queries.ts";

type Ctx = ServiceCtx & { supersetBin: string };
export const prepareSend = async (ctx: Ctx, input: { id: string; text: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.state !== "running") throw invalidInput("id", "Only a running agent can receive a follow-up.");
	if (run.runtime === "tmux") await managedTerminal(ctx.home).send(run.terminalId!, input.text);
	else await superset(ctx.supersetBin).send(run.workspaceId!, run.terminalId!, input.text);
	return { id: run.id };
};
export const prepareOutput = async (ctx: Ctx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.state === "stopped" && run.terminalId)
		return { text: await readFile(join(ctx.home, "agents", run.id, "output.txt"), "utf8") };
	if (!run.terminalId) return { text: "The agent has no terminal yet." };
	const text =
		run.runtime === "tmux"
			? await managedTerminal(ctx.home).output(run.terminalId)
			: await superset(ctx.supersetBin).output(run.workspaceId!, run.terminalId);
	return { text };
};
export const output = (_ctx: Ctx, _tx: Tx, input: { text: string }) => Promise.resolve(input);
