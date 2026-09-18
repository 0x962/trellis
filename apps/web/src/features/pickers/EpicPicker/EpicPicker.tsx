import { useQuery } from "@tanstack/react-query";
import type { EpicSummary } from "@trellis/api";
import { Command, type CommandItem, Popover } from "@trellis/ui";
import { createElement, type ReactElement, type RefObject, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { RowMarks } from "../components/RowMarks";

const noneId = "none";

export type EpicItemOptions = {
	// The ref of the current epic.
	current?: string;
	// The single-value picker: each row shows a check on the current epic.
	picker?: boolean;
};

// One option per epic, in the order `epics.list` returns them: open first,
// then done. The option id is the canonical epic ref, `OP/routine-runtime`,
// which the URL and `tickets.update` both take. A done epic says so.
export const epicItems = (epics: readonly EpicSummary[], options: EpicItemOptions = {}): CommandItem[] =>
	epics.map((epic) => {
		const current = epic.ref === options.current;
		return {
			id: epic.ref,
			label: epic.name,
			keywords: [epic.ref, epic.slug],
			hint: epic.state === "done" ? "Done" : undefined,
			current,
			...(options.picker ? { trailing: createElement(RowMarks, { current, afterHint: true }) } : {}),
		};
	});

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
	const list = useQuery({ ...orpc.epics.list.queryOptions({ input: { project } }), enabled: isOpen });
	const epics = list.data ?? [];

	const setOpen = (next: boolean) => {
		setOwn(next);
		onOpenChange?.(next);
	};

	// The No epic row waits for the list, so every row mounts at once. cmdk
	// highlights the first row it mounts and keeps that row when more rows
	// arrive.
	const none = !mixed && value === undefined;
	const items: CommandItem[] =
		list.data === undefined
			? []
			: [
					...epicItems(epics, { current: mixed ? undefined : value, picker: true }),
					{ id: noneId, label: "No epic", current: none, trailing: createElement(RowMarks, { current: none }) },
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
				empty={list.data === undefined ? "Load epics…" : "No epics."}
				onSelect={(id) => {
					setOpen(false);
					onPick(id === noneId ? null : epics.find((epic) => epic.ref === id)!);
				}}
			/>
		</Popover>
	);
}
