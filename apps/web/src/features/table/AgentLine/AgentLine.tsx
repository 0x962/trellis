import { cx } from "@trellis/ui";
import type { KeyboardEvent, MouseEvent, Ref } from "react";
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
	measureRef?: Ref<HTMLDivElement>;
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
// A click on the line, or Enter or Space on it, opens the session of that
// run in the sheet over this list. The line carries `role="button"` on a
// div and not a `button` element, because the message renders as markdown,
// and a link or an image inside a `button` element is invalid HTML. A click
// that starts on such a link or image does its own work and opens no sheet.
// `base.css` gives every `role="button"` the pointer cursor.
export function AgentLine({ line, top, last, depth, index, measureRef, render }: AgentLineProps) {
	const open = () => pageSheetActions.openSession(line.runId);
	const onClick = (event: MouseEvent<HTMLDivElement>) => {
		if ((event.target as HTMLElement).closest("a, img") !== null) return;
		open();
	};
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		open();
	};
	return (
		// biome-ignore lint/a11y/useSemanticElements: the message renders as markdown, which a button element cannot hold.
		<div
			ref={measureRef}
			role="button"
			tabIndex={0}
			data-index={index}
			data-agent-line={line.asks ? "asks" : line.working ? "working" : "message"}
			style={{ minHeight: `${agentLineHeight}px`, transform: `translateY(${top}px)` }}
			className={cx(
				"absolute top-0 left-0 flex w-full items-start gap-2 py-1 pr-5 text-left text-sm transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
				treeContentPad[depth],
				last && "border-b border-border",
			)}
			onClick={onClick}
			onKeyDown={onKeyDown}
		>
			<TreeBranch last={last} elbowTop={agentLineHeight / 2} depth={depth} />
			<AgentWords line={line} wrap render={render} />
		</div>
	);
}
