import type { Ticket } from "@trellis/api";
import { Button } from "@trellis/ui";
import { useApp } from "../../../../lib/appContext";

export type ConflictNoticeProps = {
	// The row as the server holds it, from the 412's payload.
	current: Ticket;
	// Sends the same write again without the version guard.
	onOverwrite: () => void;
	onClose: () => void;
};

const actorOf = (ticket: Ticket) => {
	const actor = ticket.lastActor;
	return actor === null ? "someone" : `${actor.kind}:${actor.name}`;
};

// A conditional write met a newer row. Reload takes the server's row from
// the error itself, so no refetch runs. Overwrite repeats the write with no
// expectedVersion.
export function ConflictNotice({ current, onOverwrite, onClose }: ConflictNoticeProps) {
	const { orpc, queryClient } = useApp();
	const reload = () => {
		queryClient.setQueryData(orpc.tickets.get.queryKey({ input: { ticket: current.identifier } }), current);
		onClose();
	};
	return (
		<div
			role="alert"
			className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-warning bg-warning-soft px-3 py-1.5 text-sm text-fg"
		>
			<span className="flex-1">changed by {actorOf(current)}: reload or overwrite</span>
			<Button size="sm" onClick={reload}>
				Reload
			</Button>
			<Button size="sm" variant="danger" onClick={onOverwrite}>
				Overwrite
			</Button>
		</div>
	);
}
