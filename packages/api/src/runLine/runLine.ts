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
	at: string | null;
	lastMessage: { words: string; at: string } | null;
};

const message = (run: AgentRun): RunLine["lastMessage"] => {
	const lastMessage = run.observation?.lastMessage;
	return lastMessage ? { words: `${run.name}: ${lastMessage.text}`, at: lastMessage.at } : null;
};

export function runLine(run: AgentRun): RunLine {
	const status = sessionStatus(run);
	const lastMessage = message(run);
	if (status === "starting") return { kind: "starts", words: "starts", at: null, lastMessage };
	if (status === "needs-input") {
		const request = run.observation!.attention!.requests.at(-1)!;
		if (request.kind === "permission") {
			const title = request.title.replace(/^Approve /, "");
			return { kind: "permission", words: `asks to run: ${title}`, at: request.at, lastMessage };
		}
		const text = request.kind === "question" ? (request.questions?.[0]?.question ?? request.title) : request.title;
		return { kind: request.kind, words: `asks: ${text}`, at: request.at, lastMessage };
	}
	if (status === "failed") {
		return { kind: "failed", words: run.error ? `failed: ${run.error}` : "failed", at: null, lastMessage };
	}
	if (run.state === "stopped") return { kind: "stopped", words: "stopped", at: null, lastMessage };
	if (run.state === "exited") return { kind: "exited", words: "exited", at: null, lastMessage };
	if (status === "interrupted" || status === "unavailable") {
		return { kind: "lost", words: "lost", at: null, lastMessage };
	}
	const observation = run.observation!;
	const completion = observation.attention?.completion;
	if (status === "done") {
		return { kind: "turn-done-new", words: "turn done · new", at: completion!.at, lastMessage };
	}
	if (completion) return { kind: "turn-done", words: "turn done", at: completion.at, lastMessage };
	if (status === "working") {
		const tool = observation.lastTool?.status === "running" ? observation.lastTool : null;
		return {
			kind: "works",
			words: tool ? `works, tool ${tool.name}` : "works",
			at: tool?.startedAt ?? observation.activity!.updatedAt,
			lastMessage,
		};
	}
	return { kind: "idle", words: "idle", at: observation.activity!.updatedAt, lastMessage };
}
