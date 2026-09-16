import { ORPCError } from "@orpc/server";
import { errors } from "@trellis/api";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost, nativePreset } from "../../agents/native/harnessHost.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { getRun } from "./queries.ts";
import { assertSendTarget, type SendTarget } from "./sendTarget.ts";

const target = async (ctx: ServiceCtx, id: string) => {
	const run = await ctx.newTx((tx) => getRun(tx, id));
	if (run.runtime !== "native" || !run.terminalId) throw invalidInput("id", "This agent has no local terminal.");
	return run;
};

const terminalHost = async (home: string) => nativeHost(home, process.env, await ensureNativeRuntime(home));

export const session = async (ctx: ServiceCtx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime !== "native" || !run.terminalId) return null;
	try {
		return await (await terminalHost(ctx.home)).status(run.terminalId);
	} catch (error) {
		if ((error as { code?: string }).code === "SESSION_NOT_FOUND") return null;
		throw error;
	}
};

export const output = async (ctx: ServiceCtx, input: { id: string; offset?: number }) => {
	const run = await target(ctx, input.id);
	const client = await terminalHost(ctx.home);
	return client.output(run.terminalId!, input.offset ?? 0);
};

export const input = async (ctx: ServiceCtx, input: { id: string; text: string; userInput?: boolean } & SendTarget) => {
	const run = await target(ctx, input.id);
	assertSendTarget(run, input);
	const client = await terminalHost(ctx.home);
	const process = await client.status(run.terminalId!);
	if (process?.mode !== "pty" || process.status !== "running")
		throw invalidInput("id", "This agent does not have a running interactive terminal.");
	await client.input(run.terminalId!, input.text, input.userInput);
	return {};
};

export const interrupt = async (ctx: ServiceCtx, input: { id: string } & SendTarget) => {
	const run = await target(ctx, input.id);
	assertSendTarget(run, input);
	if ((await nativePreset(ctx.home, run.terminalId!)) === "custom")
		throw invalidInput("id", "Use the custom terminal controls to interrupt its process.");
	try {
		const client = await terminalHost(ctx.home);
		await client.interrupt(run.terminalId!);
	} catch (cause) {
		throw new ORPCError("RUNNER_UNAVAILABLE", {
			defined: true,
			status: errors.RUNNER_UNAVAILABLE.status,
			message: cause instanceof Error ? cause.message : String(cause),
			data: { reason: "error" },
		});
	}
	return {};
};

export const resize = async (ctx: ServiceCtx, input: { id: string; cols: number; rows: number } & SendTarget) => {
	const run = await target(ctx, input.id);
	assertSendTarget(run, input);
	const client = await terminalHost(ctx.home);
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
