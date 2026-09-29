import { X } from "@phosphor-icons/react";
import type { TicketDependency } from "@trellis/api";
import { Button, FailureState, IconButton, StatusIcon, TicketId, Tooltip } from "@trellis/ui";

type Props = {
	items: readonly TicketDependency[];
	onRemove: (ticket: TicketDependency) => Promise<void>;
	pending: boolean;
	removing: string | null;
	loading: boolean;
	error: Error | null;
	retry: () => void;
};

export function SelectedTickets({ items, onRemove, pending, removing, loading, error, retry }: Props) {
	return (
		<section
			aria-label="Current relationships"
			aria-busy={pending || loading}
			className="max-h-48 overflow-y-auto border-b border-border p-2"
		>
			{loading && (
				<p role="status" className="text-sm text-fg-muted">
					Load relationships…
				</p>
			)}
			{error && (
				<FailureState
					title="The relationships did not load."
					detail={error.message}
					action={<Button onClick={retry}>Retry</Button>}
					variant="section"
				/>
			)}
			{!loading && !error && items.length === 0 && <p className="text-sm text-fg-muted">No relationships.</p>}
			<ul>
				{items.map((ticket) => (
					<li key={ticket.identifier} className="flex min-h-11 items-center gap-2">
						<StatusIcon category={ticket.status} />
						<div className="min-w-0 flex-1">
							<TicketId id={ticket.identifier} size="sm" />
							<p className="truncate text-sm text-fg-muted" title={ticket.title}>
								{ticket.title}
							</p>
						</div>
						<Tooltip content={`Remove ${ticket.identifier}`}>
							<IconButton
								label={`Remove ${ticket.identifier}`}
								icon={<X />}
								disabled={pending || loading || !!error}
								processing={removing === ticket.identifier}
								onClick={() => void onRemove(ticket)}
							/>
						</Tooltip>
					</li>
				))}
			</ul>
		</section>
	);
}
