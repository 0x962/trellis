import { X } from "@phosphor-icons/react";
import type { EpicSummary, Label, Priority, StatusSummary, TicketSummary, WaveSummary } from "@trellis/api";
import { Button, cx, IconButton, Kbd, Tooltip, useReducedMotion } from "@trellis/ui";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { formatCount } from "../../../lib/format";
import { EpicPicker } from "../../pickers/EpicPicker";
import { LabelPicker } from "../../pickers/LabelPicker";
import { PriorityPicker } from "../../pickers/PriorityPicker";
import { StatusPicker } from "../../pickers/StatusPicker";
import { TicketPicker } from "../../pickers/TicketPicker";
import { WavePicker } from "../../pickers/WavePicker";

// One control of the bar that opens a list of values. A table key opens one
// of them: `s` opens "status", `p` opens "priority", `l` opens "labels",
// `shift+p` opens "parent", `e` opens "epic", and `w` opens "wave".
export type BulkPicker = "status" | "priority" | "labels" | "parent" | "epic" | "wave";

export type BulkBarProps = {
	// True while a selection exists. The bar stays mounted for its exit
	// motion after this turns false.
	open: boolean;
	count: number;
	statuses: readonly StatusSummary[];
	// The project ref the parent search stays inside. That project owns the
	// labels and the epics, so a route without a project offers no Labels
	// control and no Set epic.
	project?: string;
	// The ids of the labels every selected ticket holds. The picker draws
	// each one with a check, and a pick on it removes the label everywhere.
	labelIds: readonly string[];
	// The ids of the labels some, but not all, selected tickets hold. The
	// picker draws each one with a minus, and a pick on it adds the label
	// everywhere.
	mixedLabelIds: readonly string[];
	// The ref of the epic every selected ticket holds. It is undefined when
	// every selected ticket holds no epic, and when `epicMixed` is true. Set
	// Set wave lists the waves of this epic, so that control is disabled
	// without it.
	epicRef?: string;
	// True when the selected tickets hold different epics. The picker then
	// marks no row, not even No epic.
	epicMixed: boolean;
	// The control whose list is open, or null while every list is closed.
	openPicker: BulkPicker | null;
	onOpenPickerChange: (picker: BulkPicker | null) => void;
	// `checked` is the new state of that label on every selected ticket.
	onLabel: (label: Label, checked: boolean) => void;
	onStatus: (status: StatusSummary) => void;
	onPriority: (priority: Priority) => void;
	onParent: (ticket: TicketSummary | null) => void;
	onEpic: (epic: EpicSummary | null) => void;
	// The ref of the wave every selected ticket holds. It is undefined
	// when every selected ticket holds no wave.
	waveRef?: string;
	// True when the selected tickets hold different waves. The picker
	// then marks no row, not even None.
	waveMixed: boolean;
	onWave: (wave: WaveSummary | null) => void;
	// Adds a wave with this name to the epic and moves the selection into
	// it. The wave picker offers New wave only when this is set.
	onCreateWave?: (name: string) => void;
	onCopyIds: () => void;
	onDelete: () => void;
	onClear: () => void;
};

// The length of the exit motion, the popover duration of the token table.
const exitMs = 160;

// A Tooltip that names an action and its key. The outer span takes the hover
// of the button inside it, so a picker keeps its own trigger. The inner span
// stops the focus event: the p key opens the Priority picker and moves the
// focus to the Priority button, and without this the tooltip would open on
// that focus and stand beside the open picker.
const withKey = (name: string, key: string, control: ReactElement) => (
	<Tooltip
		content={
			<span className="inline-flex items-center gap-1.5">
				{name}
				<Kbd>{key}</Kbd>
			</span>
		}
	>
		<span className="inline-flex">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the span handles no input of its own; it keeps the focus event of the button from the tooltip. */}
			<span className="inline-flex" onFocus={(event) => event.stopPropagation()}>
				{control}
			</span>
		</span>
	</Tooltip>
);

// The floating toolbar over a selection, centered on the list column above
// the footer. The parent is the table, which is `relative`. The bar rises
// in 160 ms and sinks the same way; under reduced motion it shows and
// hides in place. While it sinks it is inert and hidden from assistive
// technology, so the selection reads as cleared at once.
//
// A write through this bar keeps the selection, so a person sets the status
// of the same rows and then their epic without selecting them again. Delete
// clears the selection, because the deleted ids name nothing.
export function BulkBar({
	open,
	count,
	statuses,
	project,
	labelIds,
	mixedLabelIds,
	epicRef,
	epicMixed,
	openPicker,
	onOpenPickerChange,
	onLabel,
	onStatus,
	onPriority,
	onParent,
	onEpic,
	waveRef,
	waveMixed,
	onWave,
	onCreateWave,
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
	const opener = (picker: BulkPicker) => (next: boolean) => onOpenPickerChange(next ? picker : null);

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
				<StatusPicker
					statuses={statuses}
					onPick={onStatus}
					open={openPicker === "status"}
					onOpenChange={opener("status")}
					side="top"
					trigger={<Button size="sm">Status</Button>}
				/>,
			)}
			{withKey(
				"Priority",
				"p",
				<PriorityPicker
					onPick={onPriority}
					open={openPicker === "priority"}
					onOpenChange={opener("priority")}
					side="top"
					trigger={<Button size="sm">Priority</Button>}
				/>,
			)}
			{project !== undefined &&
				withKey(
					"Labels",
					"l",
					<LabelPicker
						project={project}
						checked={labelIds}
						mixed={mixedLabelIds}
						onToggle={onLabel}
						open={openPicker === "labels"}
						onOpenChange={opener("labels")}
						side="top"
						trigger={<Button size="sm">Labels</Button>}
					/>,
				)}
			{withKey(
				"Set parent",
				"⇧P",
				<TicketPicker
					project={project}
					onPick={onParent}
					open={openPicker === "parent"}
					onOpenChange={opener("parent")}
					side="top"
					trigger={<Button size="sm">Set parent</Button>}
				/>,
			)}
			{project !== undefined &&
				withKey(
					"Set epic",
					"e",
					<EpicPicker
						project={project}
						value={epicRef}
						mixed={epicMixed}
						onPick={onEpic}
						open={openPicker === "epic"}
						onOpenChange={opener("epic")}
						side="top"
						trigger={<Button size="sm">Set epic</Button>}
					/>,
				)}
			{project !== undefined &&
				(epicRef === undefined ? (
					<Tooltip content="Select tickets of one epic">
						<Button size="sm" focusableWhenDisabled disabled>
							Set wave
						</Button>
					</Tooltip>
				) : (
					withKey(
						"Set wave",
						"w",
						<WavePicker
							epic={epicRef}
							value={waveRef}
							mixed={waveMixed}
							onPick={onWave}
							onCreate={onCreateWave}
							open={openPicker === "wave"}
							onOpenChange={opener("wave")}
							side="top"
							trigger={<Button size="sm">Set wave</Button>}
						/>,
					)
				))}
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
