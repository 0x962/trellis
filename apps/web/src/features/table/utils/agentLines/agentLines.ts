import { type AgentRun, activityWords, type RunLineSpan, runLine } from "@trellis/api";

// The words of one agent line, and the dot it shows. `parts` cuts the same
// text into pieces, and the pieces join back into `words`. `asks` is true
// while the run waits for a person, which turns the words yellow and puts the
// dot before them. `working` is true while the agent works, and the words
// then say what it does at this moment: the line takes the shimmer and stays
// on one line, and it settles on the last message when the turn ends. `runId`
// is the run that speaks, which a click on the line opens in the session
// sheet.
export type TicketAgentLine = {
	words: string;
	parts: readonly RunLineSpan[];
	asks: boolean;
	working: boolean;
	runId: string;
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
//
// A run that works takes the activity of `runLine` in place of its last
// message: `crisp-fjord: Edit apps/web/src/app.css` while a tool runs, and
// the text of the message while the agent writes. The words change with
// each tool call, so the line reads as live work. A run that works before
// it runs a tool or writes a message says `crisp-fjord: works`.
export const agentLineOf = (run: AgentRun): TicketAgentLine | null => {
	const line = runLine(run);
	if (line.kind === "question" || line.kind === "permission" || line.kind === "elicitation") {
		const words = `${run.name} ${line.words}`;
		return { words, parts: [{ text: words, code: false }], asks: true, working: false, runId: run.id };
	}
	if (line.kind === "works") {
		const prefix = `${run.name}: `;
		const activity = line.activity;
		const activityParts = activity?.spans ?? [{ text: line.words, code: false }];
		const words = `${prefix}${activity === null ? line.words : activityWords(activity)}`;
		return {
			words,
			parts: [{ text: prefix, code: false }, ...activityParts],
			asks: false,
			working: true,
			runId: run.id,
		};
	}
	if (line.lastMessage === null) return null;
	return {
		words: line.lastMessage.words,
		parts: [{ text: line.lastMessage.words, code: false }],
		asks: false,
		working: false,
		runId: run.id,
	};
};

// The agent line of each ticket that holds an assigned agent run, keyed by
// ticket id. The input is the result of `agentRuns.list { assigned: true }`,
// the query that the actor cell of every row reads, so the lines of a whole
// table cost no request of their own. The run kind is `agent`, the kind the
// actor cell shows.
//
// The result is a plain object, not a Map. React Query compares a query
// result with `replaceEqualDeep`, which walks a plain object and returns
// the previous one while every value is equal. It returns a Map unchanged,
// which would give the table a new identity every 2 s and redraw every
// visible row.
//
// Two agent runs can sit on one ticket, after a retry or a follow-up, and the
// server names no order for them. The line of one run wins over the line of
// another in this order: an open request, because a person must answer it;
// then a live run over a stopped or finished one; then the later activity.
export const agentLinesByTicket = (runs: readonly AgentRun[]): Readonly<Record<string, TicketAgentLine>> => {
	const lines: Record<string, TicketAgentLine> = {};
	const winners: Record<string, AgentRun> = {};
	for (const run of runs) {
		if (run.kind !== "agent" || run.ticketId === null) continue;
		const line = agentLineOf(run);
		if (line === null) continue;
		const held = lines[run.ticketId];
		if (held !== undefined && !beats(run, line, winners[run.ticketId]!, held)) continue;
		lines[run.ticketId] = line;
		winners[run.ticketId] = run;
	}
	return lines;
};

const beats = (run: AgentRun, line: TicketAgentLine, heldRun: AgentRun, held: TicketAgentLine) => {
	if (line.asks !== held.asks) return line.asks;
	if (isLive(run) !== isLive(heldRun)) return isLive(run);
	return lastActiveAt(run) >= lastActiveAt(heldRun);
};

const isLive = (run: AgentRun) => run.processStatus === "running";

// The latest time the run did something: its last message, its last tool or
// its last change of activity. ISO strings in UTC sort as times.
const lastActiveAt = (run: AgentRun) =>
	[
		run.createdAt,
		run.observation?.lastMessage?.at,
		run.observation?.lastTool?.updatedAt,
		run.observation?.activity?.updatedAt,
	].reduce<string>((latest, at) => (at != null && at > latest ? at : latest), "");
