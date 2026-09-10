import { useQuery } from "@tanstack/react-query";
import { StatusIcon } from "@trellis/ui";
import { type ReactElement, useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";

import { PickerPopover } from "../PickerPopover";

export type TicketPickerProps = {
	trigger: ReactElement;
	// The root project key: the search stays inside it, because a parent
	// never sits in another root.
	rootKey: string;
	// The ticket whose parent is picked. It is never its own parent.
	exclude: string;
	// The current parent identifier, or null.
	value: string | null;
	// Receives the picked ticket, or null for None.
	onPick: (ticket: { id: string; identifier: string } | null) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export const noneId = "none";

// The search debounce, per the plan's search section.
const debounceMs = 120;

// A ticket search with None on top. The typed text goes to `search.query`
// after 120 ms of quiet.
export function TicketPicker({ trigger, rootKey, exclude, value, onPick, open, onOpenChange }: TicketPickerProps) {
	const { orpc } = useApp();
	const [typed, setTyped] = useState("");
	const [query, setQuery] = useState("");
	useEffect(() => {
		const handle = setTimeout(() => setQuery(typed), debounceMs);
		return () => clearTimeout(handle);
	}, [typed]);
	const results = useQuery({
		...orpc.search.query.queryOptions({ input: { q: query, project: rootKey, limit: 20 } }),
		enabled: open,
	});
	const tickets = (results.data?.tickets ?? []).filter((ticket) => ticket.identifier !== exclude);
	return (
		<PickerPopover
			trigger={trigger}
			label="Tickets"
			placeholder="Search tickets"
			options={[
				{ id: noneId, label: "None" },
				...tickets.map((ticket) => ({
					id: ticket.identifier,
					label: ticket.title,
					hint: ticket.identifier,
					icon: <StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />,
				})),
			]}
			selectedId={value ?? noneId}
			onPick={(id) => onPick(id === noneId ? null : tickets.find((ticket) => ticket.identifier === id)!)}
			open={open}
			onOpenChange={onOpenChange}
			onQueryChange={setTyped}
		/>
	);
}
