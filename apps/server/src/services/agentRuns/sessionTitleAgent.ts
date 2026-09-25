import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessDescriptor } from "../../agents/harnessHost/types.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { IoCtx } from "../support.ts";
import type { LaunchRun } from "./queries.ts";

export type SessionGeneratedTitleInput = {
	run: LaunchRun;
	userMessage: string;
	agentResponse: string;
};

const titlePrompt = (input: SessionGeneratedTitleInput) => `Write a short title for this work.

Use simple English and eight words or fewer.
Explain the work, not the conversation.
Return only the title.
Do not use a model name, agent name, ticket ID, commit ID, or branch name unless the user made that term the subject.
Do not use tools.

User:
${input.userMessage}

Agent:
${input.agentResponse}`;

const cleanEnvironment = (environment: Record<string, string>) =>
	Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith("TRELLIS_")));

export async function requestSessionTitle(ctx: IoCtx, input: SessionGeneratedTitleInput) {
	const harness = input.run.harness;
	if (harness === null || harness.preset === "custom")
		throw new Error("A custom harness cannot create a session title.");
	const source: HarnessDescriptor = JSON.parse(
		await readFile(join(ctx.home, "harness-attempts", input.run.terminalId!, "launch.json"), "utf8"),
	);
	const directory = await mkdtemp(join(tmpdir(), "trellis-session-title-"));
	const attemptId = randomUUID();
	const host = nativeHost(ctx.home, cleanEnvironment(source.spec.env ?? {}));
	try {
		const started = await host.start({
			id: attemptId,
			harness: source.harness,
			cwd: directory,
			prompt: titlePrompt(input),
			model: harness.model,
			effort: harness.effort,
			timeoutMs: 60_000,
		});
		const complete = (session: typeof started.process) =>
			session.agent?.outcome === "completed" && session.agent.lastMessage !== null;
		const completed = complete(started.process)
			? started.process
			: await host.waitFor(attemptId, complete, { limitMs: 60_000 });
		return completed.agent!.lastMessage!.text;
	} finally {
		for (const result of await Promise.allSettled([host.stop(attemptId)]))
			if (result.status === "rejected") ctx.log("session title cleanup failed", { error: String(result.reason) });
		for (const result of await Promise.allSettled([
			rm(directory, { recursive: true, force: true }),
			rm(join(ctx.home, "harness-attempts", attemptId), { recursive: true, force: true }),
		]))
			if (result.status === "rejected") ctx.log("session title cleanup failed", { error: String(result.reason) });
	}
}
