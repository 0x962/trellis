import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { HarnessDescriptor } from "../../agents/harnessHost/types.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { capacityAvailable } from "../assignments/capacity.ts";
import { recordRequest, replayRequest } from "../assignments/requests.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { assertProjectActive } from "../refs.ts";
import { reserveRestart } from "../restartAgents/reserveRestart.ts";
import { assertResume } from "../submanagers/assertResume.ts";
import type { IoCtx } from "../support.ts";
import { assertNativeWorkEnabled } from "./nativeControl.ts";
import { startNative } from "./nativeStart.ts";
import { getRun } from "./queries.ts";

type Input = { id: string; accountId?: string; expectedTerminalId: string; requestId: string };
export async function prepareResume(ctx: IoCtx, input: Input, start: typeof startNative = startNative) {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	await ctx.newTx((tx) => assertResume(ctx.core, tx, run));
	if (run.runtime !== "native" || !run.projectId || !run.personaId)
		throw invalidInput("id", "This assignment has no resumable native session.");
	const target = {
		personaId: run.personaId,
		projectId: run.projectId,
		ticketId: run.ticketId,
		newSession: false,
		accountId: input.accountId ?? null,
		resumeRunId: run.id,
		previousAttemptId: input.expectedTerminalId,
	};
	const request = { requestId: input.requestId, target };
	const replay = await ctx.newTx((tx) => replayRequest(ctx.core, tx, request));
	if (replay) return { id: replay.id };
	if (run.terminalId !== input.expectedTerminalId)
		throw invalidInput(
			"expectedTerminalId",
			"This assignment has another attempt. Read its current session before you resume it.",
		);
	const previous = await nativeHost(ctx.home).status(input.expectedTerminalId);
	if (previous.status !== "exited")
		throw invalidInput("id", "Stop the prior process and confirm it exited before you resume the session.");
	if (!previous.agent?.sessionId || !previous.launch)
		throw invalidInput("id", "The prior attempt has no confirmed provider session to resume.");
	const descriptor: HarnessDescriptor = JSON.parse(
		await readFile(join(ctx.home, "harness-attempts", input.expectedTerminalId, "launch.json"), "utf8"),
	);
	const reservation = await ctx.newTx(async (tx) => {
		await tx.execute(sql`SELECT id FROM projects WHERE id=${run.projectId} FOR UPDATE`);
		const replay = await replayRequest(ctx.core, tx, request);
		if (replay) return { replay: true as const, run: replay };
		await assertNativeWorkEnabled(tx);
		assertProjectActive(ctx.core, run.projectId!);
		const current = await getRun(tx, input.id);
		await assertResume(ctx.core, tx, current);
		if (current.terminalId !== input.expectedTerminalId)
			throw invalidInput("expectedTerminalId", "Another call already replaced this attempt.");
		if (current.ticketId) {
			const duplicates = await rows(
				tx,
				sql`SELECT id FROM agent_runs WHERE ticket_id=${current.ticketId} AND persona_id=${current.personaId} AND id<>${current.id} AND closed_at IS NULL`,
			);
			if (duplicates.length) throw invalidInput("id", "Another agent already owns this ticket and persona.");
			if (current.closedAt && !(await capacityAvailable(tx, { projectId: current.projectId! })))
				throw invalidInput("id", "The project has no available worker capacity.");
		}
		const config = await projectLaunchConfig(tx, { projectId: run.projectId! });
		const selected = await selectAccount(tx, {
			accountId: input.accountId ?? run.accountId,
			config: {
				...config,
				harness: HarnessSchema.parse({ preset: descriptor.harness, model: previous.agent?.model ?? undefined }),
			},
			useDefault: false,
		});
		if (selected.config.harness.preset !== descriptor.harness)
			throw invalidInput("accountId", "A saved conversation requires an account for the same harness.");
		await tx.execute(sql`UPDATE agent_runs SET closed_at=NULL,account_id=${selected.accountId} WHERE id=${run.id}`);
		const reserved = await reserveRestart(
			ctx.core,
			tx,
			{
				runId: run.id,
				previousAttemptId: input.expectedTerminalId,
				attempt: { id: randomUUID(), token: randomBytes(32).toString("base64url") },
				providerSessionId: previous.agent!.sessionId!,
				workspace: previous.launch!.cwd,
				harness: descriptor.harness,
				model: previous.agent?.model ?? undefined,
				done: false,
			},
			true,
		);
		if (!reserved) throw invalidInput("id", "This assignment or flow no longer permits a resume.");
		await recordRequest(ctx.core, tx, { ...request, runId: run.id });
		return { replay: false as const, ...reserved };
	});
	if (reservation.replay) return { id: reservation.run.id };
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	return start(ctx, {
		...reservation,
		attempt: reservation.attempt!,
		resume: true,
		previousAttemptId: input.expectedTerminalId,
		previousAccountId: run.accountId ?? null,
		context: "",
		resumePrompt:
			"Continue this assignment in the same conversation and workspace. Check any interrupted operation before you repeat it.",
	});
}
