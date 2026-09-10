import type { TicketSummary } from "@trellis/api";
import { PriorityIcon, StatusIcon, TicketId } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { usePeek } from "../TicketPeek/hooks/usePeek";

export type TicketListProps = {
	tickets: readonly TicketSummary[];
};

export function TicketList({ tickets }: TicketListProps) {
	const peek = usePeek();
	const { orpc, queryClient } = useApp();
	const preload = (identifier: string) => {
		void queryClient.ensureQueryData(orpc.tickets.get.queryOptions({ input: { ticket: identifier } }));
	};

	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<ul aria-label="Tickets" className="divide-y divide-border border-y border-border">
				{tickets.map((ticket) => (
					<TicketRow key={ticket.id} ticket={ticket} onOpen={peek.open} onPreload={preload} />
				))}
			</ul>
		</div>
	);
}

function TicketRow({
	ticket,
	onOpen,
	onPreload,
}: {
	ticket: TicketSummary;
	onOpen: (identifier: string, from: HTMLElement) => void;
	onPreload: (identifier: string) => void;
}) {
	return (
		<li onPointerEnter={() => onPreload(ticket.identifier)} onFocus={() => onPreload(ticket.identifier)}>
			<div className="flex h-9 items-center gap-3 px-4 text-base text-fg hover:bg-surface">
				<StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />
				<PriorityIcon priority={ticket.priority} />
				<a
					href={`/t/${ticket.identifier}`}
					className="rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
				>
					<TicketId id={ticket.identifier} className="w-16" />
				</a>
				<button
					type="button"
					onClick={(event) => onOpen(ticket.identifier, event.currentTarget)}
					className="min-w-0 flex-1 truncate rounded-sm text-left focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
				>
					{ticket.title}
				</button>
			</div>
		</li>
	);
}
