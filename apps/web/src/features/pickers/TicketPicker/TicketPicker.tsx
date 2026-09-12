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
	onPick: (ticket: TicketSummary | null) => void;
	trigger: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The parent popover: a search over the tickets of the scope, an identifier
// match first, and a None option that clears the parent.
export function TicketPicker({
	project,
	value,
	exclude = [],
	onPick,
	trigger,
	open,
	onOpenChange,
	finalFocus,
	side,
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
			current: ticket.identifier === value,
			icon: <StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />,
			children: <span className="truncate font-mono text-fg-muted">{ticket.title}</span>,
		})),
		...(search.trim() === "" ? [{ id: noneId, label: "None", current: value === undefined }] : []),
	];

	return (
		<Popover
			trigger={trigger}
			label="Parent"
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
				placeholder="Set parent: an identifier or a title"
				filter={false}
				onSearchChange={setSearch}
				items={items}
				empty={q === "" ? "Type to search." : "No results."}
				onSelect={(id) => {
					setOpen(false);
					onPick(id === noneId ? null : tickets.find((ticket) => ticket.identifier === id)!);
				}}
			/>
		</Popover>
	);
}
