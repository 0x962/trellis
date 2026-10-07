import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Badge } from "../../../../primitives/Badge";
import { Button } from "../../../../primitives/Button";
import { Checkbox } from "../../../../primitives/Checkbox";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import { FailureState } from "../../../FailureState";
import { type WaveStartTicket, WaveTicketTree } from "../WaveTicketTree";

export function WaveStartContent({
	wave,
	epic,
	tickets,
	total,
	selectedCount,
	readyCount,
	waitingCount,
	unavailableCount,
	readySelected,
	assignedCount,
	failures,
	starting,
	submitted,
	canSelect,
	assignmentStatus,
	assignmentError,
	onRetryAssignments,
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
	waitingCount: number;
	unavailableCount: number;
	readySelected: number;
	assignedCount: number;
	failures: readonly { identifier: string; detail: string }[];
	starting: boolean;
	submitted: boolean;
	canSelect: boolean;
	assignmentStatus: "loading" | "error" | "ready";
	assignmentError?: string;
	onRetryAssignments?: () => void;
	agent: ReactNode;
	startLabel: string;
	onClose: () => void;
	onStart: () => void;
	onToggle: (id: string, checked: boolean) => void;
	onSelectReady: (checked: boolean) => void;
}) {
	const failedCount = failures.length;
	const complete = submitted && !starting;
	const allAssigned = complete && assignedCount > 0 && failedCount === 0;
	const retryLabel = `Retry ${failedCount} failed ${failedCount === 1 ? "ticket" : "tickets"}`;
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
					<span role="status" aria-live="polite" className="ml-auto text-sm text-fg-muted tabular">
						{submitted
							? starting
								? `${assignedCount} assigned, ${selectedCount} starting`
								: `${assignedCount} assigned${failedCount > 0 ? `, ${failedCount} failed` : ""}`
							: `${selectedCount} selected`}
					</span>
				</div>
				{!submitted && assignmentStatus === "ready" ? (
					<fieldset className="wave-start-readiness" aria-label="Wave readiness">
						<Badge tone="ok">{readyCount} ready</Badge>
						<Badge tone="wait">{waitingCount} waiting</Badge>
						<Badge>{unavailableCount} unavailable</Badge>
					</fieldset>
				) : assignmentStatus !== "ready" ? (
					<div className="wave-start-readiness">
						<Badge tone={assignmentStatus === "error" ? "bad" : "wait"}>
							{assignmentStatus === "error" ? "Assignments unavailable" : "Checking assignments"}
						</Badge>
					</div>
				) : null}
				{waitingCount > 0 && !submitted && (
					<p className="wave-start-hint">Select a waiting ticket to start it before its prerequisites finish.</p>
				)}
				{total === 0 ? (
					<p className="py-4 text-sm text-fg-muted">No tickets in this wave.</p>
				) : (
					<WaveTicketTree tickets={tickets} onToggle={onToggle} />
				)}
				{assignmentStatus === "loading" && total > 0 && (
					<p role="status" className="py-3 text-sm text-fg-muted">
						Trellis checks current assignments before this wave can start.
					</p>
				)}
				{assignmentStatus === "error" && total > 0 && (
					<FailureState
						title="Assignments did not load"
						description="Start wave stays unavailable until Trellis can check current assignments."
						detail={assignmentError}
						action={
							<Button size="md" variant="primary" onClick={onRetryAssignments}>
								Retry
							</Button>
						}
					/>
				)}
				{assignmentStatus === "ready" && !canSelect && total > 0 && (
					<p className="py-3 text-sm text-fg-muted">No unassigned Todo tickets in this wave.</p>
				)}
				{failedCount > 0 && complete && (
					<FailureState
						title={assignedCount > 0 ? "Some agents did not start" : "No agents started"}
						description={
							assignedCount > 0
								? `${assignedCount} ${assignedCount === 1 ? "agent is" : "agents are"} assigned. Your launch choice stays selected.`
								: "Your selected tickets and launch choice stay selected."
						}
						detail={failures.map(({ identifier, detail }) => `${identifier}: ${detail}`).join("\n")}
						action={
							<Button size="md" variant="primary" disabled={assignmentStatus !== "ready"} onClick={onStart}>
								{retryLabel}
							</Button>
						}
					/>
				)}
				{allAssigned && (
					<p role="status" className="wave-start-success">
						{assignedCount} {assignedCount === 1 ? "agent is" : "agents are"} assigned. The selected tickets now show
						their agents.
					</p>
				)}
			</section>
			<footer className="wave-start-footer">
				<div className="wave-start-agent">
					{canSelect && (
						<>
							<div className="wave-start-agent-label">
								<span className="text-sm font-medium">Launch choice</span>
								<span className="text-xs text-fg-muted">Applies to every selected ticket</span>
							</div>
							{agent}
						</>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-3">
					{complete ? (
						<Button variant="primary" onClick={onClose}>
							Done
						</Button>
					) : (
						<Button variant="quiet" disabled={starting} onClick={onClose}>
							{canSelect ? "Cancel" : "Close"}
						</Button>
					)}
					{canSelect && (!submitted || starting) && (
						<Button
							variant="primary"
							disabled={assignmentStatus !== "ready" || starting || selectedCount === 0}
							onClick={onStart}
						>
							{starting ? "Starting…" : startLabel}
						</Button>
					)}
				</div>
			</footer>
		</>
	);
}
