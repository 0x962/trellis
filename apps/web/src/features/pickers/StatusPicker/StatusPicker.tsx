import type { Status, StatusCategory } from "@trellis/api";
import { StatusIcon } from "@trellis/ui";
import type { ReactElement } from "react";
import { PickerPopover } from "../PickerPopover";

export type StatusPickerProps = {
	trigger: ReactElement;
	statuses: readonly Status[];
	value: string;
	onPick: (status: Status) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const groups: Record<StatusCategory, string> = {
	todo: "Todo",
	started: "Started",
	review: "Review",
	done: "Done",
	canceled: "Canceled",
};

// The statuses of the ticket's project, grouped by category in position
// order. Enter applies the highlighted one.
export function StatusPicker({ trigger, statuses, value, onPick, open, onOpenChange }: StatusPickerProps) {
	const ordered = [...statuses].sort((a, b) => a.position - b.position);
	return (
		<PickerPopover
			trigger={trigger}
			label="Statuses"
			placeholder="Change status"
			options={ordered.map((status) => ({
				id: status.id,
				label: status.name,
				group: groups[status.category],
				icon: <StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />,
			}))}
			selectedId={value}
			onPick={(id) => onPick(ordered.find((status) => status.id === id)!)}
			open={open}
			onOpenChange={onOpenChange}
		/>
	);
}
