import type { AgentRun, SessionDetail, SessionUpdate, SessionUpdates } from "@trellis/api";
import { id, timestamp } from "./project";
import { observer, run, session, sessionResponses } from "./session";

export type TerminalSessionState = "running" | "idle" | "completed" | "needs-input" | "interrupted" | "unavailable";

export const terminalOutput: Record<TerminalSessionState, string> = {
	running: "Review in progress.",
	idle: "Ready for input.",
	completed: "Review complete.",
	"needs-input": "Select the next view.",
	interrupted: "Review interrupted.",
	unavailable: "Process status unavailable.",
};

export function terminalSession(state: TerminalSessionState): SessionDetail {
	const completed = state === "completed";
	const observation: NonNullable<AgentRun["observation"]> = {
		checkedAt: timestamp,
		controllable: state !== "unavailable",
		activity: { state: state === "running" ? "working" : "idle", updatedAt: timestamp },
		lastMessage: { text: terminalOutput[state], at: timestamp },
		lastTool: null,
		outcome: completed ? "completed" : state === "interrupted" ? "interrupted" : null,
		turnId: "storybook-review-turn",
		attention: {
			sequence: 1,
			completion: completed ? { sequence: 1, at: timestamp } : null,
			failure: null,
			requests:
				state === "needs-input"
					? [
							{
								id: "storybook-view-question",
								kind: "question",
								title: "The agent needs a view choice.",
								blocking: true,
								sequence: 1,
								at: timestamp,
								questions: [
									{
										id: "view",
										question: "Which view needs the next review?",
										options: [{ label: "Board" }, { label: "Table" }],
										multiple: false,
									},
								],
							},
						]
					: [],
		},
	};
	return {
		...session,
		run: {
			...run,
			state: "running",
			processStatus: state === "unavailable" ? "unknown" : "running",
			terminalId: `storybook-terminal-${state}`,
			observation,
		},
	};
}

const previous: SessionUpdate = {
	id: id(410),
	sessionId: session.id,
	runId: run.id,
	requestId: null,
	body: "The agent checks the board and table at desktop and phone widths.",
	embeds: [],
	createdAt: "2026-09-30T11:55:00.000Z",
};
const latest: SessionUpdate = {
	...previous,
	id: id(411),
	body: "Review complete. The board and table checks pass.",
	createdAt: timestamp,
};
export const completedUpdates: SessionUpdates = {
	latest,
	previous,
	request: null,
	history: [latest, previous],
	nextCursor: null,
};
export const completedAfterExit: SessionDetail = {
	...terminalSession("completed"),
	run: { ...terminalSession("completed").run, state: "exited", processStatus: "exited" },
};

export const responsesForSession = (detail: SessionDetail, updates = false) => ({
	...sessionResponses,
	"sessions.get": detail,
	"sessions.list": [detail],
	"agentRuns.list": { items: [detail.run], nextCursor: null },
	"agentRuns.seen": { id: detail.run.id },
	"sessionObservers.get": { ...observer, enabled: updates },
	"sessionUpdates.get": completedUpdates,
});
