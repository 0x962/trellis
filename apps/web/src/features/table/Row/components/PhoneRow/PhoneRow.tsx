import type { TicketSummary } from "@trellis/api";
import { cx, StatusIcon } from "@trellis/ui";
import type { MouseEvent, ReactNode, Ref } from "react";
import { compactRelativeTime } from "../../../../../lib/format";
import { AgentWords } from "../../../AgentLine";
import { PrCells } from "../../../PrRow";
import { prPhoneCells } from "../../../PrRow/prRowText";
import { phoneRowHeight } from "../../../rowHeights";
import type { TicketAgentLine } from "../../../utils/agentLines";
import { type PhoneLine, phoneLineOf } from "./phoneLine";

export type PhoneRowProps = {
	ref: Ref<HTMLDivElement>;
	ticket: TicketSummary;
	// The priority cell of the row, with its picker.
	priority: ReactNode;
	// The actor cell of the row. The epic layout draws it at the end of the
	// first line.
	actor: ReactNode;
	// Set on the epic table alone: the line of the ticket's run, or null
	// when the run says nothing. It picks the epic layout.
	agentLine?: TicketAgentLine | null;
	// The offset inside the virtual body.
	top?: number;
	group?: string;
	focused: boolean;
	selected: boolean;
	onFocus?: (id: string) => void;
	onClick?: (id: string, event: MouseEvent) => void;
};

const phoneLineContent = (line: PhoneLine) => {
	if (line.kind === "agent") return <AgentWords line={line.line} />;
	if (line.kind === "pr") return <PrCells pr={line.pr} cells={prPhoneCells(line.pr)} />;
	return <span className="truncate">{line.words}</span>;
};

// The cells of the epic layout. Line 1 holds the status icon, the ID, the
// title and the actor. Line 2 holds one fact from `phoneLineOf`. The row is
// the one control, and at 56 px tall it is a touch target of more than
// 44 px. `overflow-hidden` on line 2 cuts a long pull request line at the
// right edge, so the row never wraps to a third line.
function EpicCells({
	ticket,
	actor,
	agentLine,
}: {
	ticket: TicketSummary;
	actor: ReactNode;
	agentLine: TicketAgentLine | null;
}) {
	const line = phoneLineOf(ticket, agentLine);
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-1">
			<div className="flex min-w-0 items-center gap-2">
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div role="gridcell" data-column="status" className="flex shrink-0 items-center">
					<StatusIcon
						category={ticket.status.category}
						reviewer={ticket.status.reviewer ?? undefined}
						label={ticket.status.name}
					/>
				</div>
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div
					role="gridcell"
					data-column="id"
					className="shrink-0 font-mono text-sm whitespace-nowrap text-fg-faint tabular"
				>
					{ticket.identifier}
				</div>
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div role="gridcell" data-column="title" className="min-w-0 flex-1 truncate text-sm text-fg">
					{ticket.title}
				</div>
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div role="gridcell" data-column="actor" className="flex shrink-0 items-center empty:hidden">
					{actor}
				</div>
			</div>
			{line !== null && (
				<div
					data-line={line.kind}
					className="flex min-w-0 items-center gap-2 overflow-hidden pl-6 text-sm text-fg-muted"
				>
					{phoneLineContent(line)}
				</div>
			)}
		</div>
	);
}

// The cells of a list route: the priority mark in a column of its own, then
// the ID, the status icon, and the time on the first line with the title on
// the second. The priority mark is the one control in the row, and on a
// coarse pointer it draws 44 px, which the two text lines beside it leave
// room for.
function ListCells({ ticket, priority }: { ticket: TicketSummary; priority: ReactNode }) {
	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
			<div role="gridcell" data-column="priority" className="flex shrink-0 items-center">
				{priority}
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-center gap-3">
					{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
					<div role="gridcell" data-column="id" className="font-mono text-sm whitespace-nowrap text-fg-faint tabular">
						{ticket.identifier}
					</div>
					<span className="flex-1" />
					{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
					<div role="gridcell" data-column="status" className="flex items-center">
						<StatusIcon
							category={ticket.status.category}
							reviewer={ticket.status.reviewer ?? undefined}
							label={ticket.status.name}
						/>
					</div>
					{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
					<div role="gridcell" data-column="updated" className="text-xs text-fg-faint tabular">
						{compactRelativeTime(ticket.updatedAt)}
					</div>
				</div>
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div role="gridcell" data-column="title" data-line="title" className="truncate text-sm text-fg">
					{ticket.title}
				</div>
			</div>
		</>
	);
}

// One ticket below 768 px, in two lines of 56 px. The epic table draws the
// layout of `EpicCells` and every other list draws the layout of
// `ListCells`. The PR and project cells do not show; the row keeps the grid
// roles, the roving tab stop, and the focus and selection states of the
// wide row.
export function PhoneRow({
	ref,
	ticket,
	priority,
	actor,
	agentLine,
	top,
	group,
	focused,
	selected,
	onFocus,
	onClick,
}: PhoneRowProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements lint/a11y/useKeyWithClickEvents: The virtual grid positions each row, and the table keyboard map provides every row action.
		<div
			ref={ref}
			role="row"
			tabIndex={focused ? 0 : -1}
			aria-selected={selected}
			data-identifier={ticket.identifier}
			data-group={group}
			data-focused={focused ? "" : undefined}
			data-selected={selected ? "" : undefined}
			style={{
				height: `${phoneRowHeight}px`,
				transform: top === undefined ? undefined : `translateY(${top}px)`,
			}}
			className={cx(
				"absolute top-0 left-0 flex w-full items-center gap-3 border-b border-border px-4 outline-none",
				"data-focused:bg-accent-soft/60 data-selected:bg-accent-soft",
				top === undefined && "relative",
			)}
			onFocus={(event) => {
				if (event.target === event.currentTarget) onFocus?.(ticket.id);
			}}
			onClick={(event) => onClick?.(ticket.id, event)}
		>
			{agentLine === undefined ? (
				<ListCells ticket={ticket} priority={priority} />
			) : (
				<EpicCells ticket={ticket} actor={actor} agentLine={agentLine} />
			)}
		</div>
	);
}
