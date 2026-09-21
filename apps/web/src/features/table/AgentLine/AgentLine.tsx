import { cx } from "@trellis/ui";
import type { Ref } from "react";
import { pageSheetActions } from "../../../stores/pageSheetStore";
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
	measureRef?: Ref<HTMLButtonElement>;
	// The markdown renderer of the message. `AgentWords` names what it is
	// for.
	render?: (markdown: string) => string;
};

// What the run of a ticket says, on the line under the last pull request of
// that ticket, or under the ticket row when the ticket links none. A run
// that works writes what it does at this moment on one line, and the line
// shimmers. A run that ended its turn writes its last message: those words
// wrap and never truncate, so the line is one text line tall at least and
// grows with the message. Below 768 px the table draws no such line, and the
// phone row shows the words.
//
// A click on the line, or Enter on it, opens the session of that run in the
// sheet over this list.
export function AgentLine({ line, top, last, depth, index, measureRef, render }: AgentLineProps) {
	return (
		<button
			type="button"
			ref={measureRef}
			data-index={index}
			data-agent-line={line.asks ? "asks" : line.working ? "working" : "message"}
			style={{ minHeight: `${agentLineHeight}px`, transform: `translateY(${top}px)` }}
			className={cx(
				"absolute top-0 left-0 flex w-full items-start gap-2 py-1 pr-5 text-left text-sm transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
				treeContentPad[depth],
				last && "border-b border-border",
			)}
			onClick={() => pageSheetActions.openSession(line.runId)}
		>
			<TreeBranch last={last} elbowTop={agentLineHeight / 2} depth={depth} />
			<AgentWords line={line} wrap render={render} />
		</button>
	);
}
