import type { TicketSummary } from "@trellis/api";
import { cx, StatusIcon } from "@trellis/ui";
import type { KeyboardEvent, MouseEvent, ReactNode, Ref } from "react";
import { compactRelativeTime } from "../../../../../lib/format";
import { pageSheetActions } from "../../../../../stores/pageSheetStore";
import { statusIconProps } from "../../../../statusIconProps";
import { AgentWords } from "../../../AgentWords";
import type { TableKind } from "../../../columns";
import { PrCells } from "../../../PrCells";
import { prPhoneCells } from "../../../PrRow/prRowText";
import { phoneRowHeight } from "../../../rowHeights";
import type { TicketAgentLine } from "../../../utils/agentLines";
import type { TicketDisclosure as TicketDisclosureState } from "../../../utils/flattenGroups";
import { TicketDisclosure } from "../TicketDisclosure";
import { type PhoneLine, phoneLineOf } from "./phoneLine";

export type PhoneRowProps = {
	ref: Ref<HTMLDivElement>;
	ticket: TicketSummary;
	// The priority cell of the row, with its picker.
	priority: ReactNode;
	// The actor cell of the row. The epic layout draws it at the end of the
	// first line.
	actor: ReactNode;
	// `epic` draws `EpicCells` and `list` draws `ListCells`.
	layout: TableKind;
	// The line of the ticket's run, or null when the run says nothing. The
	// epic layout reads it for line 2.
	agentLine: TicketAgentLine | null;
	disclosure: TicketDisclosureState;
	// The offset inside the virtual body.
	top?: number;
	group?: string;
	focused: boolean;
	selected: boolean;
	onFocus?: (id: string) => void;
	onClick?: (id: string, event: MouseEvent) => void;
	href: string;
	onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
	onToggleDisclosure?: () => void;
};

// The words of the run open its session. The row around them opens the
// ticket, so the click stops there. The row keeps the finger target of the
// phone list: it stands 56 px tall, and these words take one text line of
// it.
const AgentLineButton = ({ line }: { line: TicketAgentLine }) => (
	<button
		type="button"
		className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
		onClick={(event) => {
			event.stopPropagation();
			pageSheetActions.openSession(line.runId);
		}}
	>
		<AgentWords line={line} />
	</button>
);

const phoneLineContent = (line: PhoneLine) => {
	if (line.kind === "agent") return <AgentLineButton line={line.line} />;
	if (line.kind === "pr") return <PrCells pr={line.pr} cells={prPhoneCells(line.pr)} />;
	return <span className="truncate">{line.words}</span>;
};

// The row opens the ticket, and the words of the run inside it open the
// session of that run. At 56 px the row is larger than the 44 px that a
// finger needs, and the words take one text line of it. `overflow-hidden`
// on line 2 cuts a long pull request line, so the row never grows to a
// third line.
function EpicCells({
	ticket,
	actor,
	agentLine,
	disclosure,
	onToggleDisclosure,
}: {
	ticket: TicketSummary;
	actor: ReactNode;
	agentLine: TicketAgentLine | null;
	disclosure: TicketDisclosureState;
	onToggleDisclosure?: () => void;
}) {
	const line = disclosure === "collapsed" ? null : phoneLineOf(ticket, agentLine);
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-1">
			<div className="flex min-w-0 items-center gap-2">
				{disclosure !== null && (
					<TicketDisclosure identifier={ticket.identifier} disclosure={disclosure} onToggle={onToggleDisclosure} />
				)}
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div role="gridcell" data-column="status" className="flex shrink-0 items-center">
					<StatusIcon {...statusIconProps(ticket.status)} label={ticket.status.name} />
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
					className="flex min-w-0 items-center gap-2 overflow-hidden pl-5.5 text-sm text-fg-muted"
				>
					{phoneLineContent(line)}
				</div>
			)}
		</div>
	);
}

// The priority mark is the one control in the row. On a coarse pointer it
// draws 44 px, which is taller than one text line, so it stays outside the
// block that holds the two text lines and the 56 px row centres it.
function ListCells({ ticket, priority }: { ticket: TicketSummary; priority: ReactNode }) {
	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
			<div role="gridcell" data-column="status" className="flex shrink-0 items-center">
				<StatusIcon {...statusIconProps(ticket.status)} label={ticket.status.name} />
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-center gap-3">
					{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
					<div role="gridcell" data-column="id" className="font-mono text-sm whitespace-nowrap text-fg-faint tabular">
						{ticket.identifier}
					</div>
					<span className="flex-1" />
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
			{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
			<div role="gridcell" data-column="priority" className="flex shrink-0 items-center">
				{priority}
			</div>
		</>
	);
}

// One ticket below 768 px, in two lines of 56 px. The row keeps the grid
// roles, the roving tab stop, and the focus and selection states of the
// wide row.
export function PhoneRow({
	ref,
	ticket,
	priority,
	actor,
	layout,
	agentLine,
	disclosure,
	top,
	group,
	focused,
	selected,
	onFocus,
	onClick,
	href,
	onKeyDown,
	onToggleDisclosure,
}: PhoneRowProps) {
	const onLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
		event.stopPropagation();
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
		event.preventDefault();
		onClick?.(ticket.id, event);
	};
	const stopLinkPropagation = (event: MouseEvent<HTMLAnchorElement>) => {
		event.stopPropagation();
	};
	return (
		// biome-ignore lint/a11y/useSemanticElements: The virtual grid positions each row, so a table element cannot hold it.
		<div
			ref={ref}
			role="row"
			tabIndex={focused ? 0 : -1}
			aria-selected={selected}
			aria-expanded={disclosure === null ? undefined : disclosure === "expanded"}
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
			onKeyDown={onKeyDown}
		>
			<a
				href={href}
				tabIndex={-1}
				aria-label={`Open ${ticket.identifier}`}
				className="absolute inset-0 z-0"
				onClick={onLinkClick}
				onAuxClick={stopLinkPropagation}
			>
				<span className="sr-only">Open {ticket.identifier}</span>
			</a>
			<div className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-3 [&_button]:pointer-events-auto [&_[role=button]]:pointer-events-auto">
				{layout === "epic" ? (
					<EpicCells
						ticket={ticket}
						actor={actor}
						agentLine={agentLine}
						disclosure={disclosure}
						onToggleDisclosure={onToggleDisclosure}
					/>
				) : (
					<ListCells ticket={ticket} priority={priority} />
				)}
			</div>
		</div>
	);
}
