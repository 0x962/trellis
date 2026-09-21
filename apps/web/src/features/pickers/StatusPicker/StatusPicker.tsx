import type { StatusSummary } from "@trellis/api";
import { Command, Popover } from "@trellis/ui";
import { type ReactElement, type RefObject, useRef, useState } from "react";
import { pickerListClass } from "../pickerListClass";
import { statusGroups } from "../statusGroups";
import { keyPick } from "../utils/keyPick";

export type StatusPickerProps<S extends StatusSummary> = {
	statuses: readonly S[];
	// The id of the current status.
	value?: string;
	onPick: (status: S) => void;
	trigger: ReactElement;
	// The words the trigger shows on hover and on keyboard focus. The
	// popover hides them while it is open.
	triggerTooltip?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	// The element that takes focus when the picker closes.
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The status popover: one searchable list in category order. Enter
// applies the highlighted status and closes; a number key picks its row
// while the search is empty; Escape closes and changes nothing.
export function StatusPicker<S extends StatusSummary>({
	statuses,
	value,
	onPick,
	trigger,
	triggerTooltip,
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
	const pick = (status: S) => {
		setOpen(false);
		onPick(status);
	};
	const groups = statusGroups(statuses, { current: value, picker: true });
	// The rows in display order. The first 9 take the keys 1 to 9, the same
	// numbers `statusGroups` draws on them.
	const ordered = groups.flatMap((group) =>
		group.items.map((item) => statuses.find((status) => status.id === item.id)!),
	);
	const picks = new Map(ordered.slice(0, 9).map((status, index) => [String(index + 1), () => pick(status)]));
	return (
		<Popover
			trigger={trigger}
			triggerTooltip={triggerTooltip}
			label="Status"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-64 p-0"
		>
			<div onKeyDownCapture={keyPick(picks, input)}>
				<Command
					inputRef={input}
					label="Search statuses"
					placeholder="Change status"
					groups={groups}
					listClassName={pickerListClass}
					onSelect={(id) => pick(statuses.find((status) => status.id === id)!)}
				/>
			</div>
		</Popover>
	);
}
