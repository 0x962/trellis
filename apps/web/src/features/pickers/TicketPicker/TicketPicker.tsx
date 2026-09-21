import { useQuery } from "@tanstack/react-query";
import type { TicketSummary } from "@trellis/api";
import { Command, type CommandItem, Popover, StatusIcon } from "@trellis/ui";
import { type ReactElement, type RefObject, useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";

// The search runs this long after the last keystroke.
export const searchDebounceMs = 120;

const noneId = "none";

export type TicketPickerProps = {
	// The project ref the search stays inside. Every project when absent.
	project?: string;
	// The current parent identifier.
	value?: string;
	// Tickets the list leaves out, such as the ticket itself.
	exclude?: readonly string[];
	// `null` clears the parent.
	onPick?: (ticket: TicketSummary | null) => void;
	// The ticket identifiers that a picker for a set draws as checked.
	checked?: readonly string[];
	// The checked state when it depends on facts in each search result.
	isChecked?: (ticket: TicketSummary) => boolean;
	// `checked` is the new state of the selected ticket.
	onToggle?: (ticket: TicketSummary, checked: boolean) => void;
	// False hides the None row. A picker that adds a ticket to a set has
	// nothing to clear, so `onPick` then receives a ticket only.
	allowNone?: boolean;
	trigger: ReactElement;
	// The tooltip of the trigger. An icon trigger needs one to name its action.
	triggerTooltip?: string;
	// The popover name and the search prompt. The defaults name the parent.
	label?: string;
	placeholder?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// A ticket search for one value or a set. A set keeps the popover open and
// toggles its checked rows. A single value can offer None.
export function TicketPicker({
	project,
	value,
	checked,
	isChecked,
	exclude = [],
	allowNone = true,
	onPick,
	onToggle,
	trigger,
	triggerTooltip,
	open,
	onOpenChange,
	finalFocus,
	side,
	label = "Parent",
	placeholder = "Set parent: an identifier or a title",
}: TicketPickerProps) {
	const { orpc } = useApp();
	const [own, setOwn] = useState(false);
	const [search, setSearch] = useState("");
	const [q, setQ] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;

	useEffect(() => {
		const timer = setTimeout(() => setQ(search.trim()), searchDebounceMs);
		return () => clearTimeout(timer);
	}, [search]);

	const results = useQuery({
		...orpc.search.query.queryOptions({ input: { q, project, limit: 10 } }),
		enabled: q !== "",
	});
	const tickets = (q === "" ? [] : (results.data?.tickets ?? [])).filter(
		(ticket) => !exclude.includes(ticket.identifier),
	);

	const setOpen = (next: boolean) => {
		setOwn(next);
		onOpenChange?.(next);
		if (!next) setSearch("");
	};

	const items: CommandItem[] = [
		...tickets.map((ticket) => ({
			id: ticket.identifier,
			label: ticket.identifier,
			current: onToggle === undefined && ticket.identifier === value,
			checked:
				onToggle === undefined ? undefined : (isChecked?.(ticket) ?? checked?.includes(ticket.identifier) ?? false),
			icon: <StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />,
			children: <span className="truncate text-fg-muted">{ticket.title}</span>,
		})),
		...(onToggle === undefined && allowNone && search.trim() === ""
			? [{ id: noneId, label: "None", current: value === undefined }]
			: []),
	];

	return (
		<Popover
			trigger={trigger}
			triggerTooltip={triggerTooltip}
			label={label}
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-80 p-0"
		>
			<Command
				inputRef={input}
				label="Search tickets"
				placeholder={placeholder}
				filter={false}
				onSearchChange={setSearch}
				items={items}
				empty={q === "" ? "Type to search." : "No results."}
				onSelect={(id) => {
					if (onToggle !== undefined) {
						const ticket = tickets.find((entry) => entry.identifier === id)!;
						const current = isChecked?.(ticket) ?? checked?.includes(id) ?? false;
						onToggle(ticket, !current);
						return;
					}
					setOpen(false);
					onPick!(id === noneId ? null : tickets.find((ticket) => ticket.identifier === id)!);
				}}
			/>
		</Popover>
	);
}
