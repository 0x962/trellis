import type { EpicSummary, Label, Priority, StatusSummary, TicketSummary, WaveSummary } from "@trellis/api";
import { type ReactNode, useState } from "react";
import { useStableCallback } from "../../../../hooks/useStableCallback";
import { useEscapeLayer } from "../../../../lib/hotkeys";

import { useScopeLabels } from "../../../filters/hooks/useScopeLabels";
import { priorityLabels } from "../../../pickers/PriorityPicker";
import { toggleLabel } from "../../../pickers/utils/toggleLabel";
import type { BulkPicker } from "../../../table/BulkBar";
import { useBulkWrite } from "../../../table/hooks/useBulkWrite";
import { useCopyTickets } from "../../../table/hooks/useCopyTickets";

export type BoardBulk = {
	// The open control of the bulk bar, or null while every control is closed.
	picker: BulkPicker | null;
	openPicker: (picker: BulkPicker | null) => void;
	status: (status: StatusSummary) => void;
	priority: (priority: Priority) => void;
	// `checked` is the new state of that label on every selected card.
	label: (label: Label, checked: boolean) => void;
	parent: (ticket: TicketSummary | null) => void;
	epic: (epic: EpicSummary | null) => void;
	wave: (wave: WaveSummary | null) => void;
	copyIds: () => void;
	remove: () => void;
	// The confirm dialog of `useBulkWrite`. The board renders it, or a write
	// over more than 25 cards and every delete wait forever.
	confirmDialog: ReactNode;
};

export type BoardBulkOptions = {
	// The selected cards. Every action writes to these.
	rows: readonly TicketSummary[];
	// The project ref of the route. The root of that tree owns the labels
	// and the epics.
	project?: string;
	// Runs after a delete, because the deleted ids name no card any more.
	onDeleted: () => void;
};

// The status fields a cached row carries. A picker hands over a whole
// status row, which holds more.
const statusSummary = (status: StatusSummary): StatusSummary => ({
	id: status.id,
	slug: status.slug,
	name: status.name,
	category: status.category,
	color: status.color,
});

// The board half of the bulk actions: one handler per control of the bulk
// bar, each through `useBulkWrite`. A write keeps the selection. A delete
// drops it through `onDeleted`.
export const useBoardBulk = ({ rows, project, onDeleted }: BoardBulkOptions): BoardBulk => {
	const [picker, setPicker] = useState<BulkPicker | null>(null);
	const groups = useScopeLabels(project).groups;
	const write = useBulkWrite({ onDeleted });
	const copier = useCopyTickets();

	const openPicker = useStableCallback((next: BulkPicker | null) => setPicker(next));
	// Escape closes the open control of the bulk bar. The selection layer
	// runs after this one, so the same press never does both.
	useEscapeLayer(
		"popover",
		picker !== null,
		useStableCallback(() => setPicker(null)),
	);

	const status = useStableCallback((picked: StatusSummary) => {
		const summary = statusSummary(picked);
		void write.update(rows, { status: summary.id }, `Set the status to ${summary.name}`, {
			row: { status: summary },
			verb: (subject) => `${subject} did not move to ${summary.name}.`,
		});
	});

	const priority = useStableCallback((picked: Priority) => {
		void write.update(rows, { priority: picked }, `Set the priority to ${priorityLabels[picked]}`, {
			row: { priority: picked },
			verb: (subject) => `The priority of ${subject} did not change to ${priorityLabels[picked]}.`,
		});
	});

	// A label write sends the one label it changes, never the whole set, so
	// two writers do not overwrite the labels of each other.
	const label = useStableCallback((picked: Label, checked: boolean) => {
		const fields = checked ? { addLabels: [picked.id] } : { removeLabels: [picked.id] };
		const words = `${checked ? "Add" : "Remove"} the label ${picked.name}`;
		void write.update(rows, fields, words, {
			row: (row) => ({ labels: toggleLabel(row.labels, picked, groups, checked) }),
			verb: (subject) => `The labels of ${subject} did not change.`,
		});
	});

	const parent = useStableCallback((picked: TicketSummary | null) => {
		const value = picked === null ? null : { id: picked.id, identifier: picked.identifier };
		const words = value === null ? "Clear the parent" : `Set the parent to ${value.identifier}`;
		void write.update(rows, { parent: value?.identifier ?? null }, words, {
			row: { parent: value },
			verb: (subject) => `The parent of ${subject} did not change.`,
		});
	});

	const epic = useStableCallback((picked: EpicSummary | null) => {
		const value = picked === null ? null : { id: picked.id, ref: picked.ref, name: picked.name };
		const words = value === null ? "Clear the epic" : `Set the epic to ${value.name}`;
		void write.update(rows, { epic: value?.ref ?? null }, words, {
			// A wave belongs to one epic, so the server clears the wave
			// of a card that leaves its epic. The patch does the same on the card.
			row: (row) => ({ epic: value, wave: row.epic?.id === value?.id ? row.wave : null }),
			verb: (subject) => `The epic of ${subject} did not change.`,
		});
	});

	const wave = useStableCallback((picked: WaveSummary | null) => {
		const value = picked === null ? null : { id: picked.id, ref: picked.ref, name: picked.name };
		const words = value === null ? "Clear the wave" : `Set the wave to ${value.name}`;
		void write.update(rows, { wave: value?.ref ?? null }, words, {
			row: { wave: value },
			verb: (subject) => `The wave of ${subject} did not change.`,
		});
	});

	const copyIds = useStableCallback(() => void copier.copyIds(rows));
	const remove = useStableCallback(() => void write.remove(rows));

	return {
		picker,
		openPicker,
		status,
		priority,
		label,
		parent,
		epic,
		wave,
		copyIds,
		remove,
		confirmDialog: write.confirmDialog,
	};
};
