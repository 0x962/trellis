import type { AgentRun } from "../schemas/agentRun.ts";
import { sessionStatus } from "../sessionStatus/sessionStatus.ts";

export type RunLineKind =
	| "starts"
	| "works"
	| "question"
	| "permission"
	| "elicitation"
	| "idle"
	| "turn-done"
	| "turn-done-new"
	| "failed"
	| "stopped"
	| "exited"
	| "lost";

export type RunLine = {
	kind: RunLineKind;
	words: string;
	since: string | null;
	lastMessage: { words: string; at: string } | null;
	rawError: string | null;
};

export function isAgentWorking(run: Pick<AgentRun, "processStatus" | "observation">): boolean {
	return (
		run.processStatus === "running" &&
		run.observation?.controllable === true &&
		run.observation.activity?.state === "working" &&
		run.observation.outcome === null
	);
}

const lastMessageLine = (run: AgentRun): RunLine["lastMessage"] => {
	const lastMessage = run.observation?.lastMessage;
	return lastMessage ? { words: `${run.name}: ${lastMessage.text}`, at: lastMessage.at } : null;
};

const executionServiceError = (error: string) =>
	error.includes("ENOENT") || error.includes("ECONNREFUSED") || error.includes("execution service");

const failedWords = (error: string | null) => {
	if (error === null) return { words: "failed", rawError: null };
	if (error.includes("no live record"))
		return { words: "did not run: Trellis cannot find a live execution record", rawError: error };
	if (executionServiceError(error))
		return { words: "did not run: Trellis could not reach the execution service", rawError: error };
	return { words: `failed: ${error}`, rawError: null };
};

export function runLine(run: AgentRun): RunLine {
	const status = sessionStatus(run);
	const lastMessage = lastMessageLine(run);
	if (status === "starting") return { kind: "starts", words: "starts", since: null, lastMessage, rawError: null };
	if (status === "needs-input") {
		const request = run.observation!.attention!.requests.at(-1)!;
		if (request.kind === "permission") {
			const toolName = request.title.replace(/^Approve /, "");
			return { kind: "permission", words: `asks to run: ${toolName}`, since: request.at, lastMessage, rawError: null };
		}
		const text = request.kind === "question" ? (request.questions?.[0]?.question ?? request.title) : request.title;
		return { kind: request.kind, words: `asks: ${text}`, since: request.at, lastMessage, rawError: null };
	}
	if (status === "failed") {
		return { kind: "failed", ...failedWords(run.error), since: null, lastMessage };
	}
	if (status === "stopped") {
		const kind = run.state === "stopped" ? "stopped" : "exited";
		return { kind, words: kind, since: null, lastMessage, rawError: null };
	}
	if (status === "interrupted" || status === "unavailable") {
		return {
			kind: "lost",
			words: run.error ? failedWords(run.error).words : "did not run: Trellis cannot find a live execution record",
			since: null,
			lastMessage,
			rawError: run.error ?? null,
		};
	}
	const observation = run.observation!;
	const completion = observation.attention?.completion;
	// sessionStatus returns `done` only when the completion is newer than `seenAttention` for this attempt.
	if (status === "done") {
		return { kind: "turn-done-new", words: "turn done · new", since: completion!.at, lastMessage, rawError: null };
	}
	if (status === "working") {
		const runningTool = observation.lastTool?.status === "running" ? observation.lastTool : null;
		return {
			kind: "works",
			words: runningTool ? `works, tool ${runningTool.name}` : "works",
			since: runningTool?.startedAt ?? observation.activity!.updatedAt,
			lastMessage,
			rawError: null,
		};
	}
	if (completion) return { kind: "turn-done", words: "turn done", since: completion.at, lastMessage, rawError: null };
	return { kind: "idle", words: "idle", since: observation.activity?.updatedAt ?? null, lastMessage, rawError: null };
}
