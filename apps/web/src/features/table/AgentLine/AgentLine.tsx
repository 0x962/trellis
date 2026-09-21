import { AttentionDot, cx } from "@trellis/ui";
import { agentLineHeight } from "../rowHeights";
import type { TicketAgentLine } from "../utils/agentLines";

type AgentLineProps = {
	line: TicketAgentLine;
	// The offset of this line inside the virtual body.
	top: number;
};

// The dot and the words of one agent line. The epic table draws them on the
// line under a ticket row, and a phone row draws them on its second line.
export function AgentWords({ line }: { line: TicketAgentLine }) {
	return (
		<>
			{line.asks && <AttentionDot label="The run waits for a person." />}
			<span className={cx("truncate", line.asks ? "text-warning" : "text-fg-muted")} title={line.words}>
				{line.words}
			</span>
		</>
	);
}

// What the run of a ticket says, on the line under that ticket's row in the
// epic table. The line is 24 px tall whatever it holds, because the
// virtualizer reserves that height before the line renders. Below 768 px
// the table draws no such line, and the phone row shows the words.
//
// The line is text, not a control. The session of the run opens from the
// agent card of the row and from the ticket page.
export function AgentLine({ line, top }: AgentLineProps) {
	return (
		<div
			data-agent-line={line.asks ? "asks" : "message"}
			style={{ height: `${agentLineHeight}px`, transform: `translateY(${top}px)` }}
			className="absolute top-0 left-0 flex w-full items-center gap-2 border-b border-border pr-5 pl-11 text-sm"
		>
			<AgentWords line={line} />
		</div>
	);
}
