import { type Priority, PrioritySchema } from "@trellis/api";
import { Command, type CommandItem, Popover, PriorityIcon } from "@trellis/ui";
import { createElement, type ReactElement, type RefObject, useRef, useState } from "react";

export const priorityLabels: Record<Priority, string> = {
	none: "None",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

// The priority options in contract order, each with its icon.
export const priorityItems = (options: { current?: Priority; checked?: readonly string[] } = {}): CommandItem[] =>
	PrioritySchema.options.map((priority) => ({
		id: priority,
		label: priorityLabels[priority],
		icon: createElement(PriorityIcon, { priority }),
		current: priority === options.current,
		checked: options.checked === undefined ? undefined : options.checked.includes(priority),
	}));

export type PriorityPickerProps = {
	value?: Priority;
	onPick: (priority: Priority) => void;
	trigger: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The priority popover: the five priorities with their icons.
export function PriorityPicker({ value, onPick, trigger, open, onOpenChange, finalFocus, side }: PriorityPickerProps) {
	const [own, setOwn] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;
	const setOpen = (next: boolean) => {
		setOwn(next);
		onOpenChange?.(next);
	};
	return (
		<Popover
			trigger={trigger}
			label="Priority"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-56 p-0"
		>
			<Command
				inputRef={input}
				label="Search priorities"
				placeholder="Change priority"
				items={priorityItems({ current: value })}
				onSelect={(id) => {
					setOpen(false);
					onPick(id as Priority);
				}}
			/>
		</Popover>
	);
}
