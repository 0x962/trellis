import type { EpicSummary, Label, Priority, StatusSummary, TicketSummary, WaveSummary } from "@trellis/api";
import { cx, DoneWash, insetRowSelection, TicketId } from "@trellis/ui";
import { type KeyboardEvent, type MouseEvent, memo, type ReactNode, useRef } from "react";
import { compactRelativeTime } from "../../../lib/format";
import type { Density } from "../../../stores/uiStore";
import { ActorAvatar } from "../../agents/ActorAvatar";
import {
	type ColumnId,
	gridColumnsClass,
	gridStyle,
	isEpicTable,
	narrowHidden,
	statusIconOnly,
	type TableKind,
} from "../columns";
import { TreeStem } from "../TreeLines";
import type { TicketAgentLine } from "../utils/agentLines";
import type { TicketDisclosure as TicketDisclosureState } from "../utils/flattenGroups";
import { EpicCell } from "./components/EpicCell";
import { HiddenPickers } from "./components/HiddenPickers";
import { LabelsCell } from "./components/LabelsCell";
import { PhoneRow } from "./components/PhoneRow";
import { PrCell } from "./components/PrCell";
import { PriorityCell } from "./components/PriorityCell";
import { ProjectCell } from "./components/ProjectCell";
import { ReleasesCell } from "./components/ReleasesCell";
import { SelectCell } from "./components/SelectCell";
import { StatusCell } from "./components/StatusCell";
import { TicketDisclosure } from "./components/TicketDisclosure";
import { TitleCell } from "./components/TitleCell";
import { WaitsCell } from "./components/WaitsCell";

// The inline editors a row opens.
export type EditField = "status" | "priority" | "parent" | "labels" | "epic" | "wave";

// One change a row's picker or the bulk bar applies. `checked` on a label
// change is the new state of that label on the ticket.
export type RowChange =
	| { status: StatusSummary }
	| { priority: Priority }
	| { parent: TicketSummary | null }
	| { epic: EpicSummary | null }
	| { wave: WaveSummary | null }
	| { label: Label; checked: boolean };

export type RowProps = {
	ticket: TicketSummary;
	density: Density;
	// The visible column ids, in order.
	columns: string[];
	// The project ref of the route, or undefined on /all.
	viewedProject?: string;
	// The offset inside the virtual body.
	top?: number;
	// The group key, for the rows of a group.
	group?: string;
	// Below 768 px the row is a `PhoneRow` of two lines.
	phone?: boolean;
	// The layout of the `PhoneRow`.
	phoneLayout?: TableKind;
	// The line of the ticket's run, for the phone row.
	agentLine?: TicketAgentLine | null;
	disclosure?: TicketDisclosureState;
	// True when child lines follow the row. The row then starts the tree
	// rule under its status icon and draws no bottom border, so the ticket
	// and its child lines read as one group.
	hasChildLines?: boolean;
	focused?: boolean;
	// True while the row plays the green wash of a ticket that was marked
	// done a moment ago.
	washing?: boolean;
	selected?: boolean;
	// True while any row is selected.
	selecting?: boolean;
	// The picker that is open on this row.
	editing?: EditField | null;
	statuses?: readonly StatusSummary[];
	onFocus?: (id: string) => void;
	onClick?: (id: string, event: MouseEvent) => void;
	onToggleDisclosure?: (id: string) => void;
	// A double click on the title. The title never edits inline.
	onOpen?: (id: string) => void;
	onToggleSelect?: (id: string) => void;
	onEditingChange?: (id: string, field: EditField | null) => void;
	onChange?: (ticket: TicketSummary, change: RowChange) => void;
};

export { phoneRowHeight, rowHeights } from "../rowHeights";

import { rowHeights } from "../rowHeights";

const noStatuses: StatusSummary[] = [];
const linkedCellClass =
	"pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_[role=button]]:pointer-events-auto [&_[role=checkbox]]:pointer-events-auto";

// One ticket as a grid row: the cells in column order, the roving tab stop,
// and the focus bar. The row is memoized, so a live patch on one ticket
// re-renders that row alone.
export const Row = memo(function Row({
	ticket,
	density,
	columns,
	viewedProject,
	top,
	group,
	phone = false,
	phoneLayout = "list",
	agentLine = null,
	disclosure = null,
	hasChildLines = false,
	focused = false,
	washing = false,
	selected = false,
	selecting = false,
	editing = null,
	statuses = noStatuses,
	onFocus,
	onClick,
	onToggleDisclosure,
	onOpen,
	onToggleSelect,
	onEditingChange,
	onChange,
}: RowProps) {
	const element = useRef<HTMLDivElement>(null);
	const { identifier } = ticket;
	const href = `/t/${identifier}`;
	const editingChange = (field: EditField) => (open: boolean) => onEditingChange?.(ticket.id, open ? field : null);
	const change = (value: RowChange) => onChange?.(ticket, value);
	const toggleDisclosure = () => onToggleDisclosure?.(ticket.id);
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		if (event.key === "ArrowRight" && disclosure === "collapsed") {
			event.preventDefault();
			toggleDisclosure();
		}
		if (event.key === "ArrowLeft" && disclosure === "expanded") {
			event.preventDefault();
			toggleDisclosure();
		}
	};
	const onLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
		event.stopPropagation();
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
		event.preventDefault();
		onClick?.(ticket.id, event);
	};
	const stopLinkPropagation = (event: MouseEvent<HTMLAnchorElement>) => {
		event.stopPropagation();
	};

	const cells: Record<string, ReactNode> = {
		select: (
			<SelectCell
				identifier={identifier}
				selected={selected}
				selecting={selecting}
				onToggle={() => onToggleSelect?.(ticket.id)}
			/>
		),
		priority: (
			<PriorityCell
				priority={ticket.priority}
				open={editing === "priority"}
				onOpenChange={editingChange("priority")}
				onPick={(priority) => change({ priority })}
				finalFocus={element}
				className={phone ? "pointer-coarse:size-11" : undefined}
			/>
		),
		id: <span className="font-mono text-sm whitespace-nowrap text-fg-faint tabular">{identifier}</span>,
		title: <TitleCell ticket={ticket} />,
		labels: (
			<LabelsCell
				labels={ticket.labels}
				project={ticket.project.key}
				open={editing === "labels"}
				onOpenChange={editingChange("labels")}
				onToggle={(label, checked) => change({ label, checked })}
				finalFocus={element}
			/>
		),
		status: (
			<StatusCell
				status={ticket.status}
				statuses={statuses}
				progress={ticket.childCount === 0 ? undefined : ticket.childDoneCount / ticket.childCount}
				iconOnly={statusIconOnly(columns)}
				open={editing === "status"}
				onOpenChange={editingChange("status")}
				onPick={(status) => change({ status })}
				finalFocus={element}
			/>
		),
		pr: ticket.pr === null ? null : <PrCell pr={ticket.pr} density={density} />,
		project: <ProjectCell projectKey={ticket.project.key} viewedProject={viewedProject} />,
		waits: <WaitsCell waitsOn={ticket.waitsOn} ready={ticket.ready} />,
		releases: <ReleasesCell releases={ticket.releases} />,
		actor: <ActorAvatar ticketId={ticket.id} />,
		updated: <span className="text-sm text-fg-muted tabular">{compactRelativeTime(ticket.updatedAt)}</span>,
		created: <span className="text-sm text-fg-muted tabular">{compactRelativeTime(ticket.createdAt)}</span>,
		parent: ticket.parent === null ? null : <TicketId id={ticket.parent.identifier} size="sm" />,
		epic: ticket.epic === null ? null : <EpicCell epic={ticket.epic} />,
		wave:
			ticket.wave === null ? null : (
				<span className="truncate text-sm text-fg-muted" title={ticket.wave.name}>
					{ticket.wave.name}
				</span>
			),
		subtickets:
			ticket.childCount === 0 ? null : (
				<span className="text-sm text-fg-muted tabular">
					{ticket.childDoneCount}/{ticket.childCount}
				</span>
			),
	};

	if (phone) {
		return (
			<PhoneRow
				ref={element}
				ticket={ticket}
				priority={cells.priority}
				actor={cells.actor}
				layout={phoneLayout}
				agentLine={agentLine}
				disclosure={disclosure}
				top={top}
				group={group}
				focused={focused}
				washing={washing}
				selected={selected}
				onFocus={onFocus}
				onClick={onClick}
				href={href}
				onKeyDown={onKeyDown}
				onToggleDisclosure={toggleDisclosure}
			/>
		);
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements: The virtual grid positions each row, so a table element cannot hold it.
		<div
			ref={element}
			role="row"
			tabIndex={focused ? 0 : -1}
			aria-selected={selected}
			aria-expanded={disclosure === null ? undefined : disclosure === "expanded"}
			data-identifier={identifier}
			data-group={group}
			data-focused={focused ? "" : undefined}
			data-selected={selected ? "" : undefined}
			style={{
				...gridStyle(columns),
				height: `${rowHeights[density]}px`,
				transform: top === undefined ? undefined : `translateY(${top}px)`,
			}}
			className={cx(
				"group/row absolute top-0 left-0 grid w-full items-center gap-3 px-5 outline-none transition-colors duration-hover max-md:gap-2 max-md:px-4",
				gridColumnsClass,
				!hasChildLines && "border-b border-border",
				density === "comfortable" ? "text-base" : "text-sm",
				// The focus bar sits at the left edge of the inset hover and selection
				// background. Its own layer keeps it visible while `DoneWash` crosses the row.
				"before:absolute before:top-1 before:bottom-1 before:left-3 before:z-10 before:w-0.5 before:rounded-sm before:bg-accent before:opacity-0 before:content-[''] max-md:before:left-2",
				insetRowSelection,
				"data-focused:before:opacity-100",
				top === undefined && "relative",
			)}
			onFocus={(event) => {
				if (event.target === event.currentTarget) onFocus?.(ticket.id);
			}}
			onClick={(event) => onClick?.(ticket.id, event)}
			onDoubleClick={() => onOpen?.(ticket.id)}
			onKeyDown={onKeyDown}
		>
			{washing && <DoneWash />}
			<a
				href={href}
				tabIndex={-1}
				data-row-link=""
				aria-label={`Open ${identifier}`}
				className="absolute inset-0 z-0"
				onClick={onLinkClick}
				onAuxClick={stopLinkPropagation}
			>
				<span className="sr-only">Open {identifier}</span>
			</a>
			{columns.map((column) => (
				// biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order.
				<div
					key={column}
					role="gridcell"
					data-column={column}
					className={cx(
						"relative z-10 flex min-w-0 items-center",
						linkedCellClass,
						narrowHidden.includes(column as ColumnId) && "max-md:hidden",
					)}
				>
					{cells[column]}
				</div>
			))}
			{/* The last track of an epic row. `ticketDisclosure` gives a caret to a done or
			    canceled ticket that links a pull request or holds a run, and to no other
			    ticket, so the track is empty on most rows. It keeps its width either way,
			    so the cells of every row of the table sit at the same x. */}
			{isEpicTable(columns) && (
				<div data-column="disclosure" className={cx("relative z-10 flex items-center justify-end", linkedCellClass)}>
					{disclosure !== null && (
						<TicketDisclosure identifier={identifier} disclosure={disclosure} onToggle={toggleDisclosure} />
					)}
				</div>
			)}
			{hasChildLines && <TreeStem depth={1} />}
			<HiddenPickers
				ticket={ticket}
				columns={columns}
				editing={editing}
				statuses={statuses}
				finalFocus={element}
				onEditingChange={editingChange}
				onChange={change}
			/>
		</div>
	);
});
