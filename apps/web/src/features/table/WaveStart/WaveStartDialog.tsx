import { type Harness, HarnessSchema, type TicketSummary } from "@trellis/api";
import { Dialog, StartControls, TicketId } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { LaunchFields } from "../../agents/LaunchFields";
import { startLabel, type WavePlan, wavePlan } from "./wavePlan";

export type WaveStartDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// The name of the wave, such as `Wave 3`.
	wave: string;
	// The ticket rows of the wave group, in table order.
	tickets: readonly TicketSummary[];
	// The ids of the tickets that hold an open agent run.
	assigned: ReadonlySet<string>;
};

export function WaveStartDialog({ open, onOpenChange, wave, tickets, assigned }: WaveStartDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={`Start ${wave}`}
			description="Start one agent on every ready ticket of the wave."
			size="lg"
		>
			<WaveStartForm tickets={tickets} assigned={assigned} onClose={() => onOpenChange(false)} />
		</Dialog>
	);
}

// The error text of each ticket whose last start failed, keyed by ticket id.
// A ticket whose start succeeded maps to null.
type Results = Record<string, string | null>;

// The form lives inside the dialog popup, so every open gets a new `batch`.
// The request id of a ticket is `batch:ticket id`. A second click sends the
// same id, and the server returns the run it already started for that id.
function WaveStartForm({
	tickets,
	assigned,
	onClose,
}: {
	tickets: readonly TicketSummary[];
	assigned: ReadonlySet<string>;
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [harness, setHarness] = useState<Harness>(() => HarnessSchema.parse({ preset: "claude" }));
	const [batch] = useState(() => crypto.randomUUID());
	// The plan at the first click. The started tickets hold an agent run after
	// that click, so the live plan would move them to the skip list.
	const [sent, setSent] = useState<WavePlan | null>(null);
	const [results, setResults] = useState<Results>({});
	const [starting, setStarting] = useState(false);
	const plan = sent ?? wavePlan(tickets, assigned);
	const targets = sent === null ? plan.start : plan.start.filter((ticket) => results[ticket.id] !== null);

	const start = async () => {
		setSent(plan);
		setStarting(true);
		const settled = await Promise.allSettled(
			targets.map((ticket) =>
				client.agentRuns.start({ ticket: ticket.identifier, harness, requestId: `${batch}:${ticket.id}` }),
			),
		);
		const next = { ...results };
		settled.forEach((outcome, index) => {
			next[targets[index]!.id] = outcome.status === "fulfilled" ? null : (outcome.reason as Error).message;
		});
		setResults(next);
		setStarting(false);
		void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
		if (Object.values(next).every((error) => error === null)) onClose();
	};

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<TicketList
				title={sent === null ? "Starts" : "Sent"}
				rows={plan.start.map((ticket) => ({
					ticket,
					note: ticket.id in results ? (results[ticket.id] ?? "started") : null,
					failed: typeof results[ticket.id] === "string",
				}))}
				empty="No ticket of this wave is ready."
			/>
			{plan.skip.length > 0 && (
				<TicketList
					title="Skips"
					rows={plan.skip.map(({ ticket, reason }) => ({ ticket, note: reason, failed: false }))}
				/>
			)}
			<StartControls
				pickers={<LaunchFields harness={harness} onChange={setHarness} disabled={starting} compact />}
				dependencies={[]}
				starting={starting}
				error={null}
				label={startLabel(targets.length)}
				disabled={targets.length === 0}
				onStart={() => void start()}
			/>
		</div>
	);
}

type ListRow = { ticket: TicketSummary; note: string | null; failed: boolean };

function TicketList({ title, rows, empty }: { title: string; rows: readonly ListRow[]; empty?: string }) {
	return (
		<section aria-label={title} className="flex min-w-0 flex-col gap-1">
			<h3 className="text-sm font-medium text-fg-muted">
				{title} <span className="text-fg-faint tabular">{rows.length}</span>
			</h3>
			{rows.length === 0 ? (
				<p className="text-sm text-fg-faint">{empty}</p>
			) : (
				<ul className="flex max-h-60 min-w-0 flex-col overflow-y-auto">
					{rows.map(({ ticket, note, failed }) => (
						<li key={ticket.id} className="flex h-7 min-w-0 items-center gap-2 text-sm">
							<TicketId id={ticket.identifier} size="sm" className="shrink-0" />
							<span className="min-w-0 flex-1 truncate text-fg" title={ticket.title}>
								{ticket.title}
							</span>
							{note !== null && (
								<span
									role={failed ? "alert" : undefined}
									className={failed ? "max-w-1/2 truncate text-danger" : "shrink-0 text-fg-muted"}
									title={note}
								>
									{note}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
