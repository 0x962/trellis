import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commandAde } from "../../agents/commandAde/commandAde.ts";
import { managedTerminal } from "../../agents/managedTerminal/managedTerminal.ts";
import { runnerUnavailable } from "../../agents/runner.ts";
import { attempt } from "../../agents/superset/attempt.ts";
import { superset } from "../../agents/superset/superset.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { managerConfigOf, projectRow } from "../projectRows.ts";
import type { ServiceCtx } from "../support.ts";
import { getRun } from "./queries.ts";

type Ctx = ServiceCtx & { supersetBin: string };
export const prepareSend = async (ctx: Ctx, input: { id: string; text: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.state !== "running") throw invalidInput("id", "Only a running agent can receive a follow-up.");
	const host =
		run.runtime === "superset"
			? await ctx.newTx(async (tx) => managerConfigOf(await projectRow(tx, run.projectId!)).supersetHostId)
			: null;
	const sent = await attempt(async () => {
		if (run.runtime === "commands") await (await commandAde(ctx.home, run)).send(input.text);
		else if (run.runtime === "tmux") await managedTerminal(ctx.home).send(run.terminalId!, input.text);
		else await superset(ctx.supersetBin, host).send(run.workspaceId!, run.terminalId!, input.text);
	});
	if (!sent.ok) throw runnerUnavailable("error", sent.error);
	return { id: run.id };
};
export const prepareOutput = async (ctx: Ctx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.state === "stopped" && run.terminalId)
		return { text: await readFile(join(ctx.home, "agents", run.id, "output.txt"), "utf8") };
	if (!run.terminalId) return { text: "The agent has no terminal yet." };
	const host =
		run.runtime === "superset"
			? await ctx.newTx(async (tx) => managerConfigOf(await projectRow(tx, run.projectId!)).supersetHostId)
			: null;
	const result = await attempt(async () => {
		if (run.runtime === "commands") return (await commandAde(ctx.home, run)).output();
		return run.runtime === "tmux"
			? managedTerminal(ctx.home).output(run.terminalId!)
			: superset(ctx.supersetBin, host).output(run.workspaceId!, run.terminalId!);
	});
	if (!result.ok) throw runnerUnavailable("error", result.error);
	return { text: result.value };
};
export const output = (_ctx: Ctx, _tx: Tx, input: { text: string }) => Promise.resolve(input);
