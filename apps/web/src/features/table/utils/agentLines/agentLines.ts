import { type AgentRun, runLine } from "@trellis/api";

// The words of one agent line, and the dot it shows. `asks` is true while
// the run waits for a person, which turns the words yellow and puts the dot
// before them.
export type AgentLineText = {
	words: string;
	asks: boolean;
};

// The words a ticket row shows on its own line, or null when the run has
// neither an open request nor a message.
//
// The line shows the open request and not the last message, because a
// person reads the line to find what to answer.
//
// The line holds one colon. `runLine` writes the request words as
// `asks: <question>`, which carries that colon, so the request form puts a
// space after the run name: `crisp-fjord asks: Which cap?`. `runLine`
// writes the message words as `<name>: <text>` already, so the message form
// takes those words unchanged: `crisp-fjord: Pushed the branch.`
export const agentLineOf = (run: AgentRun): AgentLineText | null => {
	const line = runLine(run);
	if (line.kind === "question" || line.kind === "permission" || line.kind === "elicitation") {
		return { words: `${run.name} ${line.words}`, asks: true };
	}
	return line.lastMessage === null ? null : { words: line.lastMessage.words, asks: false };
};

// The agent line of each ticket that holds an assigned agent run, by
// ticket id. The input is the result of `agentRuns.list { assigned: true }`,
// the query that the actor cell of every row reads, so the lines of a whole
// table cost no request of their own. The run kind is `agent`, the kind the
// actor cell shows.
//
// Two agent runs can sit on one ticket, and the server names no order for
// them. A line with an open request stays in place of a later line that
// only repeats a message, so the ticket keeps the words a person must
// answer.
export const agentLinesOf = (runs: readonly AgentRun[]): ReadonlyMap<string, AgentLineText> => {
	const lines = new Map<string, AgentLineText>();
	for (const run of runs) {
		if (run.kind !== "agent" || run.ticketId === null) continue;
		const line = agentLineOf(run);
		if (line === null) continue;
		if (lines.get(run.ticketId)?.asks === true && !line.asks) continue;
		lines.set(run.ticketId, line);
	}
	return lines;
};
