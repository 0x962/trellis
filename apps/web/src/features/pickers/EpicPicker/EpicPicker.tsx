import { useQuery } from "@tanstack/react-query";
import type { EpicSummary } from "@trellis/api";
import { Command, type CommandItem, Popover } from "@trellis/ui";
import { type ReactElement, type RefObject, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";

const noneId = "none";

// One option per epic, in the order `epics.list` returns them: open first,
// then done. The option id is the canonical epic ref, `OP/routine-runtime`,
// which the URL and `tickets.update` both take. A done epic says so.
export const epicItems = (epics: readonly EpicSummary[], current?: string): CommandItem[] =>
	epics.map((epic) => ({
		id: epic.ref,
		label: epic.name,
		keywords: [epic.ref, epic.slug],
		hint: epic.state === "done" ? "Done" : undefined,
		current: epic.ref === current,
	}));

export type EpicPickerProps = {
	// The project ref whose epics the list holds. The list covers the
	// project and every project under it.
	project: string;
	// The ref of the current epic.
	value?: string;
	// True when the picker writes to several tickets that hold different
	// epics. No row then shows a check, so the list claims no shared value.
	mixed?: boolean;
	// `null` clears the epic.
	onPick: (epic: EpicSummary | null) => void;
	trigger: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The epic popover: the epics of the project, searchable by name and ref,
// and a No epic option that clears the epic. `onPick` sends `null` for that
// option, and a bulk caller writes `epic: null` to every selected ticket.
export function EpicPicker({
	project,
	value,
	mixed = false,
	onPick,
	trigger,
	open,
	onOpenChange,
	finalFocus,
	side,
}: EpicPickerProps) {
	const { orpc } = useApp();
	const [own, setOwn] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;
	const epics = useQuery({ ...orpc.epics.list.queryOptions({ input: { project } }), enabled: isOpen }).data ?? [];

	const setOpen = (next: boolean) => {
		setOwn(next);
		onOpenChange?.(next);
	};

	const items: CommandItem[] = [
		...epicItems(epics, mixed ? undefined : value),
		{ id: noneId, label: "No epic", current: !mixed && value === undefined },
	];

	return (
		<Popover
			trigger={trigger}
			label="Epic"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-72 p-0"
		>
			<Command
				inputRef={input}
				label="Search epics"
				placeholder="Set epic"
				items={items}
				empty="No epics."
				onSelect={(id) => {
					setOpen(false);
					onPick(id === noneId ? null : epics.find((epic) => epic.ref === id)!);
				}}
			/>
		</Popover>
	);
}
