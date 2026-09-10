import { type Priority, PrioritySchema } from "@trellis/api";
import { Command, type CommandItem, Popover, PriorityIcon } from "@trellis/ui";
import { createElement, type ReactElement, type RefObject, useRef, useState } from "react";
import { RowMarks } from "../components/RowMarks";
import { pickerListClass } from "../pickerListClass";
import { keyPick } from "../utils/keyPick";

export const priorityLabels: Record<Priority, string> = {
	none: "None",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

export type PriorityItemOptions = {
	current?: Priority;
	checked?: readonly string[];
	// The single-value picker: each row shows a check on the current
	// priority and its number key, 0 for None to 4 for Low.
	picker?: boolean;
};

// The priority options in contract order, each with its icon. The index in
// that order is the number key.
export const priorityItems = (options: PriorityItemOptions = {}): CommandItem[] =>
	PrioritySchema.options.map((priority, index) => {
		const current = priority === options.current;
		return {
			id: priority,
			label: priorityLabels[priority],
			icon: createElement(PriorityIcon, { priority }),
			current,
			checked: options.checked === undefined ? undefined : options.checked.includes(priority),
			...(options.picker ? { children: createElement(RowMarks, { current, keyLabel: String(index) }) } : {}),
		};
	});

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
	const pick = (priority: Priority) => {
		setOpen(false);
		onPick(priority);
	};
	const picks = new Map(PrioritySchema.options.map((priority, index) => [String(index), () => pick(priority)]));
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
			<div onKeyDownCapture={keyPick(picks, input)}>
				<Command
					inputRef={input}
					label="Search priorities"
					placeholder="Set priority"
					items={priorityItems({ current: value, picker: true })}
					listClassName={pickerListClass}
					onSelect={(id) => pick(id as Priority)}
				/>
			</div>
		</Popover>
	);
}
