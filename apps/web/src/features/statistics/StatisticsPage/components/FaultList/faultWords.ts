import type { StatisticsFaultKind } from "@trellis/api";
import type { FigureSource } from "../SourceMark";

// `danger` marks a fault in the machine. `warning` marks the one fault that
// a person clears, which is a review message that waits for an agent run on
// its ticket. `muted` marks a flow run that still moves on its own.
export type FaultTone = "danger" | "warning" | "muted";

export type FaultWords = {
	// What the row says the fault is.
	name: string;
	// What clears it.
	repair: string;
	tone: FaultTone;
	source: FigureSource;
	// What the age is measured from.
	ageOf: string;
};

export const faultWords: Record<StatisticsFaultKind, FaultWords> = {
	agentRunDead: {
		name: "Agent run open, its process is gone",
		repair: "Resume the agent, or close the assignment.",
		tone: "danger",
		source: "today",
		ageOf: "The age is the age of the assignment. The moment the process stopped is recorded nowhere.",
	},
	reviewMessageFailed: {
		name: "Review message failed to reach an agent",
		repair: "Read the reason on the pull request, then send the message again.",
		tone: "danger",
		source: "query",
		ageOf: "The age runs from the moment the message joined the queue.",
	},
	reviewMessageHeld: {
		name: "Review message held, the ticket runs no agent",
		repair: "Start an agent on the ticket.",
		tone: "warning",
		source: "query",
		ageOf: "The age runs from the moment the message joined the queue.",
	},
	flowRunWaiting: {
		name: "Flow run stopped at a step that no agent answers",
		repair: "Cancel the run, then start the flow again.",
		tone: "danger",
		source: "query",
		ageOf: "The age runs from the last write to the run.",
	},
	flowRunRunning: {
		name: "Flow run still runs",
		repair: "Read the age. A run that no step moved for hours holds a dead worker.",
		tone: "muted",
		source: "query",
		ageOf: "The age runs from the last write to the run.",
	},
};
