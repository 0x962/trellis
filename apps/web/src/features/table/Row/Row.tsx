import type { EpicSummary, Label, Priority, ProjectSummary, StatusSummary, TicketSummary } from "@trellis/api";
import { cx, TicketId } from "@trellis/ui";
import { type MouseEvent, memo, type ReactNode, useRef } from "react";
import { compactRelativeTime } from "../../../lib/format";
import type { Density } from "../../../stores/uiStore";
import { ActorAvatar } from "../../agents/ActorAvatar";
import { type ColumnId, gridColumnsClass, gridStyle, narrowHidden } from "../columns";
import { EpicCell } from "./components/EpicCell";
import { HiddenPickers } from "./components/HiddenPickers";
import { LabelsCell } from "./components/LabelsCell";
import { PhoneRow } from "./components/PhoneRow";
import { PrCell } from "./components/PrCell";
import { PriorityCell } from "./components/PriorityCell";
import { ProjectCell } from "./components/ProjectCell";
import { SelectCell } from "./components/SelectCell";
import { StatusCell } from "./components/StatusCell";
import { TitleCell } from "./components/TitleCell";

// The inline editors a row opens.
export type EditField = "status" | "priority" | "project" | "parent" | "labels";

// One change a row's picker or the bulk bar applies. `checked` on a label
// change is the new state of that label on the ticket.
export type RowChange =
	| { status: StatusSummary }
	| { priority: Priority }
	| { project: string }
	| { parent: TicketSummary | null }
	| { epic: EpicSummary | null }
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
	// Below 768 px: two lines, priority, ID, status icon, and time over the
	// title. The PR, actor, and project cells do not show.
	phone?: boolean;
	focused?: boolean;
	selected?: boolean;
	// True while any row is selected.
	selecting?: boolean;
	// The picker that is open on this row.
	editing?: EditField | null;
	statuses?: readonly StatusSummary[];
	projects?: readonly ProjectSummary[];
	onFocus?: (id: string) => void;
	onClick?: (id: string, event: MouseEvent) => void;
	// A double click on the title. The title never edits inline.
	onOpen?: (id: string) => void;
	onToggleSelect?: (id: string) => void;
	onEditingChange?: (id: string, field: EditField | null) => void;
	onChange?: (ticket: TicketSummary, change: RowChange) => void;
};

export { phoneRowHeight, rowHeights } from "../rowHeights";

import { rowHeights } from "../rowHeights";

const noStatuses: StatusSummary[] = [];
const noProjects: ProjectSummary[] = [];

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
	focused = false,
	selected = false,
	selecting = false,
	editing = null,
	statuses = noStatuses,
	projects = noProjects,
	onFocus,
	onClick,
	onOpen,
	onToggleSelect,
	onEditingChange,
	onChange,
}: RowProps) {
	const element = useRef<HTMLDivElement>(null);
	const { identifier, lastActor } = ticket;
	const ticketRootId = projects.find((project) => project.id === ticket.project.id)?.rootId;
	const ticketRootIds = ticketRootId === undefined ? [] : [ticketRootId];
	const editingChange = (field: EditField) => (open: boolean) => onEditingChange?.(ticket.id, open ? field : null);
	const change = (value: RowChange) => onChange?.(ticket, value);

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
				project={ticket.project.path}
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
				open={editing === "status"}
				onOpenChange={editingChange("status")}
				onPick={(status) => change({ status })}
				finalFocus={element}
			/>
		),
		pr: ticket.pr === null ? null : <PrCell pr={ticket.pr} density={density} />,
		project: (
			<ProjectCell
				path={ticket.project.path}
				viewedProject={viewedProject}
				projects={projects}
				ticketRootIds={ticketRootIds}
				open={editing === "project"}
				onOpenChange={editingChange("project")}
				onPick={(project) => change({ project })}
				finalFocus={element}
			/>
		),
		actor:
			lastActor === null || lastActor.kind === "system" ? null : <ActorAvatar actor={lastActor} ticketId={ticket.id} />,
		updated: <span className="text-sm text-fg-muted tabular">{compactRelativeTime(ticket.updatedAt)}</span>,
		created: <span className="text-sm text-fg-muted tabular">{compactRelativeTime(ticket.createdAt)}</span>,
		parent: ticket.parent === null ? null : <TicketId id={ticket.parent.identifier} size="sm" />,
		epic: ticket.epic === null ? null : <EpicCell epic={ticket.epic} />,
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
				top={top}
				group={group}
				focused={focused}
				selected={selected}
				onFocus={onFocus}
				onClick={onClick}
			/>
		);
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements lint/a11y/useKeyWithClickEvents: The virtual grid positions each row, and the table keyboard map provides every row action.
		<div
			ref={element}
			role="row"
			tabIndex={focused ? 0 : -1}
			aria-selected={selected}
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
				"group/row absolute top-0 left-0 grid w-full items-center gap-3 border-b border-border px-5 outline-none transition-colors duration-hover max-md:gap-2 max-md:px-4",
				gridColumnsClass,
				density === "comfortable" ? "text-base" : "text-sm",
				"before:absolute before:top-1 before:bottom-1 before:left-0 before:w-0.5 before:rounded-r-sm before:bg-accent before:opacity-0 before:content-['']",
				"hover:bg-band data-focused:bg-accent-soft/60 data-focused:before:opacity-100 data-selected:bg-accent-soft",
				top === undefined && "relative",
			)}
			onFocus={(event) => {
				if (event.target === event.currentTarget) onFocus?.(ticket.id);
			}}
			onClick={(event) => onClick?.(ticket.id, event)}
			onDoubleClick={() => onOpen?.(ticket.id)}
		>
			{columns.map((column) => (
				// biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order.
				<div
					key={column}
					role="gridcell"
					data-column={column}
					className={cx("flex min-w-0 items-center", narrowHidden.includes(column as ColumnId) && "max-md:hidden")}
				>
					{cells[column]}
				</div>
			))}
			<HiddenPickers
				ticket={ticket}
				columns={columns}
				editing={editing}
				statuses={statuses}
				projects={projects}
				ticketRootIds={ticketRootIds}
				finalFocus={element}
				onEditingChange={editingChange}
				onChange={change}
			/>
		</div>
	);
});
