import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import { errors } from "@trellis/api";
import { nativeClient } from "../../agents/native/connection.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { historicalOutput } from "./history/historicalOutput.ts";
import { nativeOutput } from "./nativeLifecycle.ts";
import { getRun } from "./queries.ts";
import { assertSendTarget, type SendTarget } from "./sendTarget.ts";

const runtimeUnavailable = (cause: unknown) =>
	new ORPCError("RUNNER_UNAVAILABLE", {
		defined: true,
		status: errors.RUNNER_UNAVAILABLE.status,
		message: cause instanceof Error ? cause.message : String(cause),
		data: { reason: "error" },
	});

export const prepareSend = async (
	ctx: ServiceCtx,
	input: { id: string; text: string; messageId?: string; requireIdle?: boolean } & SendTarget,
) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	assertSendTarget(run, input);
	if (run.runtime !== "native") throw invalidInput("id", "This historical assignment cannot receive new messages.");
	if (!run.terminalId) throw invalidInput("id", "The agent has no terminal yet.");
	try {
		const client = nativeClient(ctx.home);
		const session = await client.inspect(run.terminalId);
		if (session.status !== "running" || !session.controllable)
			throw new Error("The execution service cannot control this agent process.");
		const messageId = input.messageId ?? randomUUID();
		const data = Buffer.from(`\x1b[200~trellis-message:${messageId}\n${input.text}\x1b[201~\r`).toString("base64");
		const sent = await client.deliver(run.terminalId, messageId, data, input.requireIdle);
		if (sent.status === "unknown")
			throw new Error("Terminal input delivery is uncertain. Inspect the terminal before a resend.");
		if (session.activity !== null) {
			let acknowledged = false;
			for await (const event of client.subscribeSession(run.terminalId, AbortSignal.timeout(10_000))) {
				if (event.type === "session" && event.session.acknowledgedMessageIds.includes(messageId)) {
					acknowledged = true;
					break;
				}
			}
			if (!acknowledged)
				throw new Error("The agent did not acknowledge this message. Inspect the terminal before a resend.");
		}
	} catch (cause) {
		if (cause instanceof Error && "code" in cause && cause.code === "RUNTIME_BUSY") throw cause;
		throw runtimeUnavailable(cause);
	}
	return { id: run.id };
};

export const prepareOutput = async (ctx: ServiceCtx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime !== "native") return historicalOutput(ctx.home, run);
	if (!run.terminalId) return { text: "The agent has no terminal yet." };
	const capture = Bun.file(join(ctx.home, "agents", run.id, `output-${run.terminalId}.txt`));
	if (run.closedAt !== null && (await capture.exists())) return { text: await capture.text() };
	try {
		return { text: await nativeOutput(ctx.home, run.terminalId) };
	} catch (cause) {
		throw runtimeUnavailable(cause);
	}
};
export const output = (_ctx: ServiceCtx, _tx: Tx, input: { text: string }) => Promise.resolve(input);
