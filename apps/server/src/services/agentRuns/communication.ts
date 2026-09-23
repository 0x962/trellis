import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import type { HarnessPreset } from "@trellis/api";
import { errors } from "@trellis/api";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { HarnessHost } from "../../agents/harnessHost/harnessHost.ts";
import { nativeClient } from "../../agents/native/connection.ts";
import { nativeHost, nativePreset } from "../../agents/native/harnessHost.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { historicalOutput } from "./history/historicalOutput.ts";
import { nativeOutput } from "./nativeLifecycle.ts";
import { getRun } from "./queries.ts";
import { replayResumedMessage } from "./replayResumedMessage";
import type { ResumeCtx } from "./resume.ts";
import { resumeIdleSession } from "./resumeIdleSession";
import { assertSendTarget, type SendTarget } from "./sendTarget.ts";
import { waitForReceipt } from "./waitForReceipt.ts";

const runtimeUnavailable = (cause: unknown) =>
	new ORPCError("RUNNER_UNAVAILABLE", {
		defined: true,
		status: errors.RUNNER_UNAVAILABLE.status,
		message: cause instanceof Error ? cause.message : String(cause),
		data: { reason: "error" },
	});

export const prepareSend = async (
	ctx: ResumeCtx,
	input: { id: string; text: string; messageId?: string; interrupt?: boolean; idleForMs?: number } & SendTarget,
	deps: {
		client: Pick<RuntimeClient, "inspect" | "deliver" | "subscribeSession">;
		host: Pick<HarnessHost, "send" | "interrupt">;
		preset: (id: string) => Promise<HarnessPreset>;
		resume?: typeof resumeIdleSession;
	} = { client: nativeClient(ctx.home), host: nativeHost(ctx.home), preset: (id) => nativePreset(ctx.home, id) },
) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (await replayResumedMessage(ctx, run, input, deps.client)) return { id: run.id };
	assertSendTarget(run, input);
	if (run.closedAt !== null)
		throw invalidInput("id", "This assignment is closed. Start a new attempt before sending a message.");
	if (run.runtime !== "native") throw invalidInput("id", "This historical assignment cannot receive new messages.");
	if (!run.terminalId) throw invalidInput("id", "The agent has no terminal yet.");
	const { client, host } = deps;
	const preset = await deps.preset(run.terminalId);
	if (input.interrupt && preset === "custom")
		throw invalidInput("interrupt", "Use the custom terminal controls to interrupt its process.");
	const messageId = input.messageId ?? randomUUID();
	const resumeIdle = async () => {
		if (input.idleForMs !== undefined) return { id: run.id, skipped: true };
		const latest = await client.inspect(run.terminalId!);
		if (latest.acknowledgedMessageIds.includes(messageId)) return { id: run.id };
		return (deps.resume ?? resumeIdleSession)(ctx, {
			id: run.id,
			terminalId: run.terminalId!,
			text: input.text,
			messageId,
		});
	};
	try {
		const session = await client.inspect(run.terminalId);
		if (session.stopReason === "idle") return await resumeIdle();
		if (session.status !== "running" || !session.controllable)
			throw new Error("The execution service cannot control this agent process.");
		const idleBefore =
			input.idleForMs === undefined ? undefined : new Date(ctx.now().getTime() - input.idleForMs).toISOString();
		if (idleBefore !== undefined && (session.activity?.state !== "idle" || session.activity.updatedAt >= idleBefore))
			return { id: run.id, skipped: true };
		const expected =
			idleBefore === undefined
				? undefined
				: {
						turnId: session.agent?.turnId ?? null,
						activityAt: session.activity!.updatedAt,
						idleBefore,
					};
		if (preset === "custom") {
			const data = Buffer.from(`\x1b[200~${input.text}\x1b[201~\r`).toString("base64");
			const sent = await client.deliver(run.terminalId, messageId, data, expected);
			if (sent.status === "unknown")
				throw new Error("Terminal input delivery is uncertain. Inspect the terminal before a resend.");
		} else {
			if (!session.acknowledgedMessageIds.includes(run.terminalId))
				await waitForReceipt(client, run.terminalId, run.terminalId, 60_000);
			if (input.interrupt) await host.interrupt(run.terminalId, { waitForIdle: false });
			await host.send(run.terminalId, input.text, messageId, expected);
		}
	} catch (cause) {
		if ((cause as { code?: string }).code === "SESSION_IDLE_STOPPED") return resumeIdle();
		if (input.idleForMs !== undefined && (cause as { code?: string }).code === "RUNTIME_TURN_CHANGED")
			return { id: run.id, skipped: true };
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
