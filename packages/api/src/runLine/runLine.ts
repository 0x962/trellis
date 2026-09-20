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
};

const lastMessageLine = (run: AgentRun): RunLine["lastMessage"] => {
	const lastMessage = run.observation?.lastMessage;
	return lastMessage ? { words: `${run.name}: ${lastMessage.text}`, at: lastMessage.at } : null;
};

export function runLine(run: AgentRun): RunLine {
	const status = sessionStatus(run);
	const lastMessage = lastMessageLine(run);
	if (status === "starting") return { kind: "starts", words: "starts", since: null, lastMessage };
	if (status === "needs-input") {
		const request = run.observation!.attention!.requests.at(-1)!;
		if (request.kind === "permission") {
			const toolName = request.title.replace(/^Approve /, "");
			return { kind: "permission", words: `asks to run: ${toolName}`, since: request.at, lastMessage };
		}
		const text = request.kind === "question" ? (request.questions?.[0]?.question ?? request.title) : request.title;
		return { kind: request.kind, words: `asks: ${text}`, since: request.at, lastMessage };
	}
	if (status === "failed") {
		return { kind: "failed", words: run.error ? `failed: ${run.error}` : "failed", since: null, lastMessage };
	}
	if (status === "stopped") {
		const kind = run.state === "stopped" ? "stopped" : "exited";
		return { kind, words: kind, since: null, lastMessage };
	}
	if (status === "interrupted" || status === "unavailable") {
		return { kind: "lost", words: "lost", since: null, lastMessage };
	}
	const observation = run.observation!;
	const completion = observation.attention?.completion;
	// sessionStatus returns `done` only when the completion is newer than `seenAttention` for this attempt.
	if (status === "done") {
		return { kind: "turn-done-new", words: "turn done · new", since: completion!.at, lastMessage };
	}
	if (status === "working") {
		const runningTool = observation.lastTool?.status === "running" ? observation.lastTool : null;
		return {
			kind: "works",
			words: runningTool ? `works, tool ${runningTool.name}` : "works",
			since: runningTool?.startedAt ?? observation.activity!.updatedAt,
			lastMessage,
		};
	}
	if (completion) return { kind: "turn-done", words: "turn done", since: completion.at, lastMessage };
	return { kind: "idle", words: "idle", since: observation.activity?.updatedAt ?? null, lastMessage };
}
