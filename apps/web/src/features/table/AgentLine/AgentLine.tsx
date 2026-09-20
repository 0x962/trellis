import { type AgentRun, runLine } from "@trellis/api";
import { AttentionDot, cx } from "@trellis/ui";
import { agentLineHeight } from "../rowHeights";

// The words of one agent line and the mark it carries. `asks` is true while
// the run waits for a person, which turns the words yellow and puts the dot
// before them.
export type AgentLineText = {
	words: string;
	asks: boolean;
};

export type AgentLineProps = {
	line: AgentLineText;
	// The offset of this line inside the virtual body.
	top: number;
};

// The words of a run that a ticket row shows on its own line, or null when
// the run has neither an open request nor a message.
//
// A run that waits for a person wins over the last message, because a
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
export const agentLinesOf = (runs: readonly AgentRun[]): ReadonlyMap<string, AgentLineText> => {
	const lines = new Map<string, AgentLineText>();
	for (const run of runs) {
		if (run.kind !== "agent" || run.ticketId === null) continue;
		const line = agentLineOf(run);
		if (line !== null) lines.set(run.ticketId, line);
	}
	return lines;
};

// What the run of a ticket says, on the line under that ticket's row in the
// epic table. The line is 24 px tall whatever it holds, because the
// virtualizer reserves that height before the line renders.
//
// The line is text, not a control. The session of the run opens from the
// agent card of the row and from the ticket page.
export function AgentLine({ line, top }: AgentLineProps) {
	return (
		<div
			data-agent-line={line.asks ? "asks" : "message"}
			style={{ height: `${agentLineHeight}px`, transform: `translateY(${top}px)` }}
			className="absolute top-0 left-0 flex w-full items-center gap-2 pr-5 pl-11 text-sm max-md:pr-4 max-md:pl-10"
		>
			{line.asks && <AttentionDot label="The run waits for a person." />}
			<span className={cx("truncate", line.asks ? "text-warning" : "text-fg-muted")} title={line.words}>
				{line.words}
			</span>
		</div>
	);
}
