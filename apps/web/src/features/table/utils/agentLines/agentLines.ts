import { type AgentRun, type RunLineSpan, runLine } from "@trellis/api";

// The words of one agent line, and the dot it shows. While the run works,
// `spans` holds the same text, cut into pieces. `runLine` marks each piece
// as code or text, so the row draws the command in the mono font and does
// not guess with a pattern. The pieces join back into `words`, which the row
// uses as the hover title.
export type TicketAgentLine = {
	words: string;
	asks: boolean;
	runId: string;
} & ({ working: true; spans: readonly RunLineSpan[] } | { working: false });

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
//
// A run that Trellis accepted but the harness has not confirmed yet says
// `crisp-fjord: starts`. It has no message and no activity, so without this
// line the ticket row would say nothing between the click that starts the
// agent and the first message, which can take a minute.
export const agentLineOf = (run: AgentRun): TicketAgentLine | null => {
	const line = runLine(run);
	if (line.kind === "question" || line.kind === "permission" || line.kind === "elicitation") {
		const words = `${run.name} ${line.words}`;
		return { words, asks: true, working: false, runId: run.id };
	}
	if (line.kind === "starts")
		return { words: `${run.name}: ${line.words}`, asks: false, working: false, runId: run.id };
	if (line.kind === "works") {
		const prefix = `${run.name}: `;
		const activitySpans = line.activity ?? [{ key: "state", text: line.words, kind: "text" as const }];
		const spans = [{ key: "agent", text: prefix, kind: "text" as const }, ...activitySpans];
		const words = spans.map((span) => span.text).join("");
		return {
			words,
			spans,
			asks: false,
			working: true,
			runId: run.id,
		};
	}
	if (line.lastMessage === null) return null;
	return {
		words: line.lastMessage.words,
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
