import type { StatusSummary } from "@trellis/api";
import { Command, Popover } from "@trellis/ui";
import { type ReactElement, type RefObject, useRef, useState } from "react";
import { statusGroups } from "../statusGroups";

export type StatusPickerProps<S extends StatusSummary> = {
	statuses: readonly S[];
	// The id of the current status.
	value?: string;
	onPick: (status: S) => void;
	trigger: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	// The element that takes focus when the picker closes.
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The status popover: one searchable list grouped by category. Enter
// applies the highlighted status and closes; Escape closes and changes
// nothing.
export function StatusPicker<S extends StatusSummary>({
	statuses,
	value,
	onPick,
	trigger,
	open,
	onOpenChange,
	finalFocus,
	side,
}: StatusPickerProps<S>) {
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
			label="Status"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-64 p-0"
		>
			<Command
				inputRef={input}
				label="Search statuses"
				placeholder="Change status"
				groups={statusGroups(statuses, { current: value })}
				onSelect={(id) => {
					setOpen(false);
					onPick(statuses.find((status) => status.id === id)!);
				}}
			/>
		</Popover>
	);
}
