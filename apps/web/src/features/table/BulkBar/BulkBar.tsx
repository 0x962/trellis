import { X } from "@phosphor-icons/react";
import type { EpicSummary, Priority, ProjectSummary, StatusSummary, TicketSummary } from "@trellis/api";
import { Button, cx, IconButton, Kbd, Tooltip, useReducedMotion } from "@trellis/ui";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { formatCount } from "../../../lib/format";
import { rootKey } from "../../../lib/projectPath";
import { EpicPicker } from "../../pickers/EpicPicker";
import { PriorityPicker } from "../../pickers/PriorityPicker";
import { ProjectPicker } from "../../pickers/ProjectPicker";
import { StatusPicker } from "../../pickers/StatusPicker";
import { TicketPicker } from "../../pickers/TicketPicker";

export type BulkBarProps = {
	// True while a selection exists. The bar stays mounted for its exit
	// motion after this turns false.
	open: boolean;
	count: number;
	statuses: readonly StatusSummary[];
	projects: readonly ProjectSummary[];
	ticketRootIds: readonly string[];
	// The project ref the parent search stays inside. Set epic offers the
	// epics of its root. /all has no project, so it has no Set epic.
	project?: string;
	onStatus: (status: StatusSummary) => void;
	onPriority: (priority: Priority) => void;
	onProject: (path: string) => void;
	onParent: (ticket: TicketSummary | null) => void;
	onEpic: (epic: EpicSummary | null) => void;
	onCopyIds: () => void;
	onDelete: () => void;
	onClear: () => void;
};

// The length of the exit motion, the popover duration of the token table.
const exitMs = 160;

// A Tooltip that names an action and its key. The span takes the hover and
// the focus of the button inside it, so a picker keeps its own trigger.
const withKey = (name: string, key: string, control: ReactElement) => (
	<Tooltip
		content={
			<span className="inline-flex items-center gap-1.5">
				{name}
				<Kbd>{key}</Kbd>
			</span>
		}
	>
		<span className="inline-flex">{control}</span>
	</Tooltip>
);

// The floating toolbar over a selection, centered on the list column above
// the footer. The parent is the table, which is `relative`. The bar rises
// in 160 ms and sinks the same way; under reduced motion it shows and
// hides in place. While it sinks it is inert and hidden from assistive
// technology, so the selection reads as cleared at once.
export function BulkBar({
	open,
	count,
	statuses,
	projects,
	ticketRootIds,
	project,
	onStatus,
	onPriority,
	onProject,
	onParent,
	onEpic,
	onCopyIds,
	onDelete,
	onClear,
}: BulkBarProps) {
	const reduced = useReducedMotion();
	const [mounted, setMounted] = useState(open);
	const lastCount = useRef(count);
	useEffect(() => {
		if (open) lastCount.current = count;
	}, [open, count]);
	useEffect(() => {
		if (open || reduced) {
			setMounted(open);
			return;
		}
		const timer = setTimeout(() => setMounted(false), exitMs);
		return () => clearTimeout(timer);
	}, [open, reduced]);

	if (!open && !mounted) return null;
	const shown = open ? count : lastCount.current;

	return (
		<div
			data-bulk-bar=""
			data-closing={open ? undefined : ""}
			role="toolbar"
			aria-label="Bulk actions"
			aria-hidden={open ? undefined : true}
			inert={!open}
			className={cx(
				"absolute bottom-11 left-1/2 z-40 flex h-10 w-max max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-1 rounded-lg border border-border-strong bg-elevated pr-1.5 pl-3 shadow-lg",
				"transition-[opacity,translate] duration-popover ease-out starting:translate-y-2 starting:opacity-0 data-closing:translate-y-2 data-closing:opacity-0 motion-reduce:transition-none",
				"max-md:right-4 max-md:left-4 max-md:w-auto max-md:max-w-none max-md:translate-x-0 max-md:overflow-x-auto",
			)}
		>
			<span className="text-base font-medium whitespace-nowrap text-fg tabular">{formatCount(shown)} selected</span>
			<span aria-hidden="true" className="mx-2 h-4 w-px shrink-0 bg-border" />
			{withKey(
				"Status",
				"s",
				<StatusPicker statuses={statuses} onPick={onStatus} side="top" trigger={<Button size="sm">Status</Button>} />,
			)}
			{withKey(
				"Priority",
				"p",
				<PriorityPicker onPick={onPriority} side="top" trigger={<Button size="sm">Priority</Button>} />,
			)}
			{withKey(
				"Move to project",
				"m",
				<ProjectPicker
					projects={projects}
					ticketRootIds={ticketRootIds}
					onPick={onProject}
					side="top"
					trigger={<Button size="sm">Move to project</Button>}
				/>,
			)}
			{withKey(
				"Set parent",
				"⇧P",
				<TicketPicker project={project} onPick={onParent} side="top" trigger={<Button size="sm">Set parent</Button>} />,
			)}
			{project !== undefined && (
				<EpicPicker
					project={rootKey(project)}
					onPick={onEpic}
					side="top"
					trigger={<Button size="sm">Set epic</Button>}
				/>
			)}
			{withKey(
				"Copy IDs",
				"⌘C",
				<Button size="sm" onClick={onCopyIds}>
					Copy IDs
				</Button>,
			)}
			{withKey(
				"Delete",
				"⌫",
				<Button size="sm" variant="danger-soft" onClick={onDelete}>
					Delete
				</Button>,
			)}
			<Tooltip
				content={
					<span className="inline-flex items-center gap-1.5">
						Clear selection
						<Kbd>Esc</Kbd>
					</span>
				}
			>
				<IconButton label="Clear selection" icon={<X />} size="sm" className="ml-1" onClick={onClear} />
			</Tooltip>
		</div>
	);
}
