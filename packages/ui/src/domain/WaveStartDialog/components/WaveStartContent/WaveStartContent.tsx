import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "../../../../primitives/Button";
import { Checkbox } from "../../../../primitives/Checkbox";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import { type WaveStartTicket, WaveTicketTree } from "../WaveTicketTree";

export function WaveStartContent({
	wave,
	epic,
	tickets,
	total,
	selectedCount,
	readyCount,
	readySelected,
	starting,
	submitted,
	canSelect,
	hasWaiting,
	agent,
	startLabel,
	onClose,
	onStart,
	onToggle,
	onSelectReady,
}: {
	wave: string;
	epic?: string;
	tickets: readonly WaveStartTicket[];
	total: number;
	selectedCount: number;
	readyCount: number;
	readySelected: number;
	starting: boolean;
	submitted: boolean;
	canSelect: boolean;
	hasWaiting: boolean;
	agent: ReactNode;
	startLabel: string;
	onClose: () => void;
	onStart: () => void;
	onToggle: (id: string, checked: boolean) => void;
	onSelectReady: (checked: boolean) => void;
}) {
	return (
		<>
			<header className="wave-start-heading">
				<div className="min-w-0">
					{epic && <p className="mb-2 text-sm text-fg-muted wrap-anywhere">{epic}</p>}
					<h2 data-wave-title tabIndex={-1} className="text-xl font-semibold wrap-anywhere outline-none">
						Start {wave}
					</h2>
					<p className="mt-3 text-sm text-fg-muted">Start one agent for each checked ticket.</p>
				</div>
				<Tooltip content="Close">
					<IconButton label="Close" size="sm" disabled={starting} onClick={onClose} icon={<X />} />
				</Tooltip>
			</header>
			<section className="wave-start-tickets" aria-label="Ticket selection" aria-busy={starting}>
				<div className="wave-start-counts">
					<Checkbox
						label="Select all ready tickets"
						hideLabel
						checked={readyCount > 0 && readySelected === readyCount}
						indeterminate={readySelected > 0 && readySelected < readyCount}
						disabled={submitted || readyCount === 0}
						onCheckedChange={onSelectReady}
					/>
					<h3 className="text-sm font-medium">
						Tickets <span className="ml-1 text-fg-muted tabular">{total}</span>
					</h3>
					<span role="status" className="ml-auto text-sm text-fg-muted tabular">
						{selectedCount} {submitted ? "remaining" : "starting"}
					</span>
				</div>
				{hasWaiting && !submitted && <p className="wave-start-hint">Check a waiting ticket to start it anyway.</p>}
				{total === 0 ? (
					<p className="py-4 text-sm text-fg-muted">No tickets in this wave.</p>
				) : (
					<WaveTicketTree tickets={tickets} onToggle={onToggle} />
				)}
				{!canSelect && total > 0 && (
					<p className="py-3 text-sm text-fg-muted">No unassigned Todo tickets in this wave.</p>
				)}
			</section>
			<footer className="wave-start-footer">
				<div className="wave-start-agent">{canSelect && agent}</div>
				<div className="flex shrink-0 items-center gap-3">
					<Button variant="quiet" disabled={starting} onClick={onClose}>
						{canSelect ? "Cancel" : "Close"}
					</Button>
					{canSelect && (
						<Button variant="primary" disabled={starting || selectedCount === 0} onClick={onStart}>
							{starting ? "Starting…" : startLabel}
						</Button>
					)}
				</div>
			</footer>
		</>
	);
}
