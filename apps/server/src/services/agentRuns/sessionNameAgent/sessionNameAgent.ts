import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessDescriptor } from "../../../agents/harnessHost/types.ts";
import { nativeHost } from "../../../agents/native/harnessHost.ts";
import type { IoCtx } from "../../support.ts";
import { getRun } from "../queries.ts";

export type RequestSessionNameInput = { runId: string; agentResponse: string };
export type RequestedSessionName = { candidateName: string; initialPrompt: string; protectedTerms: string[] };

const namePrompt = (initialPrompt: string, agentResponse: string) => `Write a short name for this work.

Use simple English and eight words or fewer.
Explain the work, not the conversation.
Return only the name.
Do not use a model name, agent name, ticket ID, commit ID, or branch name unless the user made that term the subject.
Do not use tools.

User:
${initialPrompt}

Agent:
${agentResponse}`;

const stripTrellisEnv = (environment: Record<string, string>) =>
	Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith("TRELLIS_")));

const cleanupAttempt = async (
	ctx: IoCtx,
	fields: { run: string; attempt: string },
	step: string,
	requestError: unknown,
	action: () => Promise<unknown>,
) => {
	try {
		await action();
	} catch (cleanupError) {
		ctx.log("session name cleanup failed", {
			...fields,
			step,
			error: String(cleanupError),
			requestError: requestError === null ? null : String(requestError),
		});
		if (requestError !== null)
			throw new AggregateError([requestError, cleanupError], "The session name request and cleanup failed.");
		throw cleanupError;
	}
};

export async function requestSessionName(ctx: IoCtx, input: RequestSessionNameInput): Promise<RequestedSessionName> {
	const run = await ctx.newTx((tx) => getRun(tx, input.runId));
	const harness = run.harness;
	if (harness === null || harness.preset === "custom")
		throw new Error("A custom harness cannot create a session name.");
	const source: HarnessDescriptor = JSON.parse(
		await readFile(join(ctx.home, "harness-attempts", run.terminalId!, "launch.json"), "utf8"),
	);
	const directory = await mkdtemp(join(tmpdir(), "trellis-session-name-"));
	const attemptId = randomUUID();
	const host = nativeHost(ctx.home, stripTrellisEnv(source.spec.env ?? {}));
	const fields = { run: input.runId, attempt: attemptId };
	let requestError: unknown = null;
	ctx.log("session name attempt started", fields);
	try {
		const started = await host.start({
			id: attemptId,
			harness: source.harness,
			cwd: directory,
			prompt: namePrompt(run.instruction, input.agentResponse),
			model: harness.model,
			effort: harness.effort,
			timeoutMs: 60_000,
		});
		const complete = (session: typeof started.process) =>
			session.agent?.outcome === "completed" && session.agent.lastMessage !== null;
		const completed = complete(started.process)
			? started.process
			: await host.waitFor(attemptId, complete, { limitMs: 60_000 });
		ctx.log("session name attempt result", fields);
		return {
			candidateName: completed.agent!.lastMessage!.text,
			initialPrompt: run.instruction,
			protectedTerms: [run.name, run.ticketIdentifier ?? "", run.harness?.model ?? ""],
		};
	} catch (error) {
		requestError = error;
		throw error;
	} finally {
		await cleanupAttempt(ctx, fields, "stop", requestError, () => host.stop(attemptId));
		await cleanupAttempt(ctx, fields, "remove directory", requestError, () =>
			rm(directory, { recursive: true, force: true }),
		);
		await cleanupAttempt(ctx, fields, "remove attempt files", requestError, () =>
			rm(join(ctx.home, "harness-attempts", attemptId), { recursive: true, force: true }),
		);
	}
}
