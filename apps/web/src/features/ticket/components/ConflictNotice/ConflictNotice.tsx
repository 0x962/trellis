import { Warning } from "@phosphor-icons/react";
import type { Ticket } from "@trellis/api";
import { ActorChip, Button, Popover } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { relativeTime } from "../../../../lib/format";

export type ConflictNoticeProps = {
	// The row as the server holds it, from the 412's payload.
	current: Ticket;
	// Sends the same write again without the version guard.
	onOverwrite: () => void;
	onClose: () => void;
};

// A conditional write met a newer row. The notice names the actor who won
// in words, never in the `agent:name` header form. "Use their version"
// takes the server's row from the error itself, so no refetch runs. "Keep
// mine" repeats the write with no expectedVersion, which replaces the other
// actor's edit, so it asks first.
export function ConflictNotice({ current, onOverwrite, onClose }: ConflictNoticeProps) {
	const { orpc, queryClient } = useApp();
	const [confirming, setConfirming] = useState(false);
	const last = current.lastActor;
	const actor =
		last !== null && last.kind !== "system"
			? { name: last.displayName ?? last.name, kind: last.kind, at: last.at }
			: null;
	const reload = () => {
		queryClient.setQueryData(orpc.tickets.get.queryKey({ input: { ticket: current.identifier } }), current);
		onClose();
	};
	const replace = () => {
		setConfirming(false);
		onOverwrite();
	};
	return (
		<div
			role="alert"
			className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-1 text-sm text-fg"
		>
			<Warning aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
			<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
				{actor === null ? (
					<span>Another actor changed this ticket. Your edit is not saved.</span>
				) : (
					<>
						<ActorChip name={actor.name} kind={actor.kind} compact />
						<span>changed this ticket {relativeTime(actor.at)}. Your edit is not saved.</span>
					</>
				)}
			</span>
			<Button size="sm" onClick={reload}>
				Use their version
			</Button>
			<Popover
				open={confirming}
				onOpenChange={setConfirming}
				align="end"
				label="Keep mine"
				className="flex w-64 flex-col gap-3 p-3"
				trigger={
					<Button size="sm" variant="danger-soft">
						Keep mine
					</Button>
				}
			>
				<p className="text-sm text-fg">Replace {actor === null ? "the other" : `${actor.name}'s`} edit?</p>
				<div className="flex justify-end gap-2">
					<Button size="sm" variant="quiet" onClick={() => setConfirming(false)}>
						Cancel
					</Button>
					<Button size="sm" variant="danger" onClick={replace}>
						Replace
					</Button>
				</div>
			</Popover>
		</div>
	);
}
