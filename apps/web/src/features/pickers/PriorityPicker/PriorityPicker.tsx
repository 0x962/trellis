import { type Priority, PrioritySchema } from "@trellis/api";
import { PriorityIcon } from "@trellis/ui";
import type { ReactElement } from "react";
import { PickerPopover } from "../PickerPopover";

export type PriorityPickerProps = {
	trigger: ReactElement;
	value: Priority;
	onPick: (priority: Priority) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export const priorityLabels: Record<Priority, string> = {
	none: "No priority",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

// The five priorities with their bars, in the order the contract lists them.
export function PriorityPicker({ trigger, value, onPick, open, onOpenChange }: PriorityPickerProps) {
	return (
		<PickerPopover
			trigger={trigger}
			label="Priorities"
			placeholder="Set priority"
			options={PrioritySchema.options.map((priority) => ({
				id: priority,
				label: priorityLabels[priority],
				icon: <PriorityIcon priority={priority} />,
			}))}
			selectedId={value}
			onPick={(id) => onPick(id as Priority)}
			open={open}
			onOpenChange={onOpenChange}
		/>
	);
}
