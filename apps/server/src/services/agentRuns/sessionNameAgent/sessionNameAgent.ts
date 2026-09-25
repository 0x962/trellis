import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessDescriptor } from "../../../agents/harnessHost/types.ts";
import { nativeHost } from "../../../agents/native/harnessHost.ts";
import type { IoCtx } from "../../support.ts";
import { getRun } from "../queries.ts";

export type RequestSessionNameInput = { runId: string; agentResponse: string };
export type RequestedSessionName = { response: string; userMessage: string; protectedTerms: string[] };

const namePrompt = (userMessage: string, agentResponse: string) => `Write a short name for this work.

Use simple English and eight words or fewer.
Explain the work, not the conversation.
Return only the name.
Do not use a model name, agent name, ticket ID, commit ID, or branch name unless the user made that term the subject.
Do not use tools.

User:
${userMessage}

Agent:
${agentResponse}`;

const stripTrellisEnv = (environment: Record<string, string>) =>
	Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith("TRELLIS_")));

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
		return {
			response: completed.agent!.lastMessage!.text,
			userMessage: run.instruction,
			protectedTerms: [run.name, run.ticketIdentifier ?? "", run.harness?.model ?? ""],
		};
	} finally {
		await host.stop(attemptId);
		await rm(directory, { recursive: true, force: true });
		await rm(join(ctx.home, "harness-attempts", attemptId), { recursive: true, force: true });
	}
}
