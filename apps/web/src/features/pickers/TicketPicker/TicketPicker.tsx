import { useQuery } from "@tanstack/react-query";
import type { TicketDependency, TicketSummary } from "@trellis/api";
import { Command, type CommandItem, Popover, SelectedTickets, StatusIcon } from "@trellis/ui";
import { type ReactElement, type RefObject, useCallback, useEffect, useRef, useState } from "react";
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
	onAdd?: (ticket: TicketSummary) => void;
	// False hides the None row in a parent picker.
	allowNone?: boolean;
	selection?: {
		items: readonly TicketDependency[];
		onRemove: (ticket: TicketDependency) => Promise<void>;
		pending: boolean;
		removing: string | null;
		loading: boolean;
		error: Error | null;
		retry: () => void;
	};
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

// A ticket search for a parent or additions to a set. A set keeps the popover open.
// A parent picker can offer None.
export function TicketPicker({
	project,
	value,
	exclude = [],
	allowNone = true,
	onPick,
	onAdd,
	selection,
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
	const remove = selection?.onRemove;
	const removeAndFocus = useCallback(
		async (ticket: TicketDependency) => {
			await remove!(ticket);
			input.current?.focus({ preventScroll: true });
		},
		[remove],
	);

	useEffect(() => {
		const timer = setTimeout(() => setQ(search.trim()), searchDebounceMs);
		return () => clearTimeout(timer);
	}, [search]);

	const results = useQuery({
		...orpc.search.query.queryOptions({ input: { q, project, limit: 10 } }),
		enabled: q !== "",
	});
	const tickets = (q === "" ? [] : (results.data?.tickets ?? [])).filter(
		(ticket) =>
			!exclude.includes(ticket.identifier) && !selection?.items.some((item) => item.identifier === ticket.identifier),
	);

	const setOpen = (next: boolean) => {
		setOwn(next);
		onOpenChange?.(next);
		if (!next) setSearch("");
	};

	// An empty search lists no tickets, so the current parent gets its own row
	// above None. The list then opens on the current parent, and Enter keeps it.
	const empty = search.trim() === "";
	const items: CommandItem[] = [
		...tickets.map((ticket) => ({
			id: ticket.identifier,
			label: ticket.identifier,
			current: onAdd === undefined && ticket.identifier === value,
			icon: <StatusIcon category={ticket.status.category} />,
			children: <span className="truncate text-fg-muted">{ticket.title}</span>,
		})),
		...(onAdd === undefined && empty && value !== undefined ? [{ id: value, label: value, current: true }] : []),
		...(onAdd === undefined && allowNone && empty ? [{ id: noneId, label: "None", current: value === undefined }] : []),
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
			className="w-80 max-w-(--available-width) max-h-(--available-height) overflow-y-auto p-0"
		>
			{selection && <SelectedTickets {...selection} onRemove={removeAndFocus} />}
			<Command
				inputRef={input}
				label="Search tickets"
				placeholder={placeholder}
				filter={false}
				onSearchChange={setSearch}
				items={items}
				empty={q === "" ? "Type to search." : "No results."}
				onSelect={(id) => {
					if (selection?.pending || selection?.loading || selection?.error) return;
					if (onAdd !== undefined) {
						const ticket = tickets.find((entry) => entry.identifier === id)!;
						onAdd(ticket);
						return;
					}
					setOpen(false);
					if (id === noneId) onPick!(null);
					else if (id !== value) onPick!(tickets.find((ticket) => ticket.identifier === id)!);
				}}
			/>
		</Popover>
	);
}
