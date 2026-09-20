import { AttentionDot, cx } from "@trellis/ui";
import { agentLineHeight } from "../rowHeights";
import type { AgentLineText } from "../utils/agentLines";

export type AgentLineProps = {
	line: AgentLineText;
	// The offset of this line inside the virtual body.
	top: number;
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
			className="absolute top-0 left-0 flex w-full items-center gap-2 border-b border-border pr-5 pl-11 text-sm max-md:pr-4 max-md:pl-10"
		>
			{line.asks && <AttentionDot label="The run waits for a person." />}
			<span className={cx("truncate", line.asks ? "text-warning" : "text-fg-muted")} title={line.words}>
				{line.words}
			</span>
		</div>
	);
}
