import { nativeClient } from "../../agents/native/connection.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { getRun } from "./queries.ts";
import { assertSendTarget, type SendTarget } from "./sendTarget.ts";

const target = async (ctx: ServiceCtx, id: string) => {
	const run = await ctx.newTx((tx) => getRun(tx, id));
	if (run.runtime !== "native" || !run.terminalId) throw invalidInput("id", "This agent has no local terminal.");
	return { run, client: nativeClient(ctx.home) };
};

export const session = async (ctx: ServiceCtx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime !== "native" || !run.terminalId) return null;
	try {
		return await nativeClient(ctx.home).inspect(run.terminalId);
	} catch (error) {
		if ((error as { code?: string }).code === "SESSION_NOT_FOUND") return null;
		throw error;
	}
};

export const output = async (ctx: ServiceCtx, input: { id: string; offset?: number }) => {
	const { run, client } = await target(ctx, input.id);
	return client.output(run.terminalId!, input.offset ?? 0);
};

export const input = async (ctx: ServiceCtx, input: { id: string; text: string; userInput?: boolean } & SendTarget) => {
	const { run, client } = await target(ctx, input.id);
	assertSendTarget(run, input);
	const process = await client.inspect(run.terminalId!);
	if (process?.mode !== "pty" || process.status !== "running")
		throw invalidInput("id", "This agent does not have a running interactive terminal.");
	await client.input(run.terminalId!, Buffer.from(input.text).toString("base64"), input.userInput);
	return {};
};

export const resize = async (ctx: ServiceCtx, input: { id: string; cols: number; rows: number } & SendTarget) => {
	const { run, client } = await target(ctx, input.id);
	assertSendTarget(run, input);
	await client.resize(run.terminalId!, input.cols, input.rows);
	return {};
};

export const result = async (_ctx: ServiceCtx, _tx: Tx, value: unknown) => value;

export const streamTarget = async (_ctx: ServiceCtx, tx: Tx, input: { id: string } & SendTarget) => {
	const run = await getRun(tx, input.id);
	if (run.runtime !== "native" || !run.terminalId) throw invalidInput("id", "This agent has no local terminal.");
	assertSendTarget(run, input);
	return { terminalId: run.terminalId, sessionId: run.sessionId };
};
