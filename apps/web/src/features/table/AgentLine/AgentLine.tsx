import { cx } from "@trellis/ui";
import type { Ref } from "react";
import { AgentWords } from "../AgentWords";
import { agentLineHeight } from "../rowHeights";
import { TreeBranch, type TreeDepth, treeContentPad } from "../TreeLines";
import type { TicketAgentLine } from "../utils/agentLines";

type AgentLineProps = {
	line: TicketAgentLine;
	// The offset of this line inside the virtual body.
	top: number;
	// True when this is the final child line of the line it hangs from. The
	// line then ends the tree rule and draws the bottom border of the group.
	last: boolean;
	// The line this one hangs from: 1 under the ticket row, 2 under the last
	// pull request of the ticket.
	depth: TreeDepth;
	// The index of the line in the virtual list, which the virtualizer reads
	// from `data-index` when it measures the line.
	index?: number;
	// The virtualizer's `measureElement`. The words wrap, so the height of
	// the line depends on its text and on the table width.
	measureRef?: Ref<HTMLDivElement>;
	// The markdown renderer of the message. `AgentWords` names what it is
	// for.
	render?: (markdown: string) => string;
};

// What the run of a ticket says, on the line under the last pull request of
// that ticket, or under the ticket row when the ticket links none. The words
// wrap and never truncate, so the line is one text line tall at least and
// grows with the message. Below 768 px the table draws no such line, and the
// phone row shows the words.
//
// The line is text, not a control. The session of the run opens from the
// agent card of the row and from the ticket page.
export function AgentLine({ line, top, last, depth, index, measureRef, render }: AgentLineProps) {
	return (
		<div
			ref={measureRef}
			data-index={index}
			data-agent-line={line.asks ? "asks" : "message"}
			style={{ minHeight: `${agentLineHeight}px`, transform: `translateY(${top}px)` }}
			className={cx(
				"absolute top-0 left-0 flex w-full items-start gap-2 py-1 pr-5 text-sm",
				treeContentPad[depth],
				last && "border-b border-border",
			)}
		>
			<TreeBranch last={last} elbowTop={agentLineHeight / 2} depth={depth} />
			<AgentWords line={line} wrap render={render} />
		</div>
	);
}
