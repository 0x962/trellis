import type { StatusCategory, TicketSummary } from "@trellis/api";
import { toast, useReducedMotion } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { dropInboxRow } from "../../utils/dropInboxRow";
import { targetStatus } from "../../utils/targetStatus";
import { inboxInput } from "../useInbox";

// The sweep lasts as long as --duration-sweep in tokens.css.
export const sweepMs = 200;

// A row that left its section and still collapses in the place it held.
type Leaving = { ticket: TicketSummary; index: number };

// The row actions every Needs you section shares.
//
// A move drops the row from the cached inbox at once, so the section count
// falls with the row and waits for no response. The row keeps its place in
// the list for the length of the sweep, which is what `rowsWithLeaving`
// returns, and the section draws it as a leaving row. A rejected move puts
// the cached inbox back the way it was and offers the write again.
export const useInboxActions = () => {
	const { client, orpc, queryClient, scheduler } = useApp();
	const reduced = useReducedMotion();
	const [leaving, setLeaving] = useState<readonly Leaving[]>([]);
	const timers = useRef(new Map<string, unknown>());
	const inboxKey = orpc.inbox.get.queryKey({ input: inboxInput });

	const drop = (id: string) =>
		queryClient.setQueryData(inboxKey, (inbox) => (inbox === undefined ? inbox : dropInboxRow(inbox, id)));

	const stopSweep = (id: string) => {
		timers.current.delete(id);
		setLeaving((current) => current.filter((entry) => entry.ticket.id !== id));
	};

	// Takes the row out of the section and, unless the person asked for less
	// motion, keeps it in place while it collapses.
	const sweepOut = (ticket: TicketSummary, index: number) => {
		drop(ticket.id);
		if (reduced) return;
		setLeaving((current) => [...current, { ticket, index }]);
		timers.current.set(
			ticket.id,
			scheduler.setTimeout(() => stopSweep(ticket.id), sweepMs),
		);
	};

	const cancelSweep = (id: string) => {
		const timer = timers.current.get(id);
		if (timer !== undefined) scheduler.clearTimeout(timer);
		stopSweep(id);
	};

	const move = (ticket: TicketSummary, category: StatusCategory, index: number) => {
		const before = queryClient.getQueryData(inboxKey);
		sweepOut(ticket, index);
		void (async () => {
			const { statuses } = await queryClient.ensureQueryData(
				orpc.statuses.list.queryOptions({ input: { project: ticket.project.id } }),
			);
			const target = targetStatus(statuses, category);
			try {
				await client.tickets.move({ ticket: ticket.identifier, status: target.id });
			} catch (error) {
				cancelSweep(ticket.id);
				queryClient.setQueryData(inboxKey, before);
				toast.error(`Couldn't move ${ticket.identifier} to ${target.name}`, {
					description: (error as Error).message,
					action: { label: "Retry", onClick: () => move(ticket, category, index) },
				});
			}
		})();
	};

	// The section's rows with every leaving row back in the place it held.
	const rowsWithLeaving = (items: TicketSummary[]) => {
		if (leaving.length === 0) return items;
		const rows = [...items];
		for (const entry of leaving) rows.splice(Math.min(entry.index, rows.length), 0, entry.ticket);
		return rows;
	};

	return {
		move,
		sweepOut,
		rowsWithLeaving,
		isSweeping: (ticket: TicketSummary) => leaving.some((entry) => entry.ticket.id === ticket.id),
	};
};
