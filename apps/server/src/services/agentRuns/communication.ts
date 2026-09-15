import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import { errors } from "@trellis/api";
import { nativeClient } from "../../agents/native/connection.ts";
import { renderTranscript } from "../../agents/nativeHarness/renderTranscript.ts";
import { sendClaude } from "../../agents/nativeHarness/sendClaude.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { harness } from "./harness.ts";
import { historicalOutput } from "./history/historicalOutput.ts";
import { nativeOutput } from "./nativeLifecycle.ts";
import { getRun } from "./queries.ts";
import { assertSendTarget, type SendTarget } from "./sendTarget.ts";
import { waitForNativeHarness } from "./waitForNativeHarness.ts";

const runtimeUnavailable = (cause: unknown) =>
	new ORPCError("RUNNER_UNAVAILABLE", {
		defined: true,
		status: errors.RUNNER_UNAVAILABLE.status,
		message: cause instanceof Error ? cause.message : String(cause),
		data: { reason: "error" },
	});

type Ctx = ServiceCtx;
export const prepareSend = async (ctx: Ctx, input: { id: string; text: string; messageId?: string } & SendTarget) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	assertSendTarget(run, input);
	if (run.runtime !== "native") throw invalidInput("id", "This historical assignment cannot receive new messages.");
	if (run.state !== "running") throw invalidInput("id", "Only a running agent can receive a follow-up.");
	try {
		const client = nativeClient(ctx.home);
		const session = (await client.list()).find((session) => session.id === run.terminalId);
		const messageId = input.messageId ?? randomUUID();
		if (session?.mode === "stdio") {
			const sent = await sendClaude(client, run.terminalId!, run.sessionId!, messageId, input.text);
			if (sent.status === "unknown")
				throw new Error("Message delivery is uncertain. Inspect the agent before a resend.");
			await waitForNativeHarness(ctx, run, (snapshot) => snapshot.acknowledgedMessageIds.includes(messageId), {
				messageId,
				timeoutMs: 10000,
			});
		} else {
			const sent = await client.deliver(run.terminalId!, messageId, Buffer.from(`${input.text}\r`).toString("base64"));
			if (sent.status === "unknown")
				throw new Error("Terminal input delivery is uncertain. Inspect the terminal before a resend.");
		}
	} catch (cause) {
		throw runtimeUnavailable(cause);
	}
	return { id: run.id };
};
export const prepareOutput = async (ctx: Ctx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime !== "native") return historicalOutput(ctx.home, run);
	if (run.state === "stopped" && run.terminalId)
		return { text: await readFile(join(ctx.home, "agents", run.id, "output.txt"), "utf8") };
	if (!run.terminalId) return { text: "The agent has no terminal yet." };
	try {
		const snapshot = await harness(ctx, input);
		return { text: snapshot ? renderTranscript(snapshot) : await nativeOutput(ctx.home, run.terminalId!) };
	} catch (cause) {
		throw runtimeUnavailable(cause);
	}
};
export const output = (_ctx: Ctx, _tx: Tx, input: { text: string }) => Promise.resolve(input);
