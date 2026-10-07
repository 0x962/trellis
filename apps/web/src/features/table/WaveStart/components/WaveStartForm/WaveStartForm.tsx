import { type Harness, HarnessSchema, type TicketSummary } from "@trellis/api";
import { WaveStartContent, type WaveStartTicket } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { startedRunList, startWave } from "../../startWave";
import { startLabel, wavePlan } from "../../wavePlan";
import { WaveLaunchFields } from "../WaveLaunchFields";
import { unfinishedDependencies, type WaveBranch, waveTree } from "../waveTree";

type Sent = {
	tickets: readonly TicketSummary[];
	assigned: ReadonlySet<string>;
	targets: TicketSummary[];
	harness: Harness;
};

export type WaveStartAssignment =
	| { status: "loading" }
	| { status: "error"; detail: string; retry: () => void }
	| { status: "ready"; ticketIds: ReadonlySet<string> };

const noAssigned = new Set<string>();

export function WaveStartForm({
	wave,
	tickets,
	assignment,
	starting,
	onStartingChange,
	onClose,
}: {
	wave: string;
	tickets: readonly TicketSummary[];
	assignment: WaveStartAssignment;
	starting: boolean;
	onStartingChange: (starting: boolean) => void;
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [harness, setHarness] = useState<Harness>(() => HarnessSchema.parse({ preset: "claude" }));
	const [batch] = useState(() => crypto.randomUUID());
	const assignmentReady = assignment.status === "ready";
	const assigned = assignmentReady ? assignment.ticketIds : noAssigned;
	const [selected, setSelected] = useState(() => new Set(wavePlan(tickets, assigned).start.map((ticket) => ticket.id)));
	const [sent, setSent] = useState<Sent | null>(null);
	const [results, setResults] = useState<Record<string, string | null>>({});
	const submitting = useRef(false);
	const displayed = sent?.tickets ?? tickets;
	const held = sent?.assigned ?? assigned;
	const eligible = assignmentReady
		? displayed.filter((ticket) => ticket.status.category === "todo" && !held.has(ticket.id))
		: [];
	const ready = eligible.filter((ticket) => ticket.ready);
	const waiting = eligible.filter((ticket) => !ticket.ready);
	const targets = sent
		? sent.targets.filter((ticket) => results[ticket.id] !== null)
		: eligible.filter((ticket) => selected.has(ticket.id));
	const chosen = new Set((sent?.targets ?? targets).map((ticket) => ticket.id));
	const readySelected = ready.filter((ticket) => chosen.has(ticket.id)).length;
	const assignedCount = sent?.targets.filter((ticket) => results[ticket.id] === null).length ?? 0;
	const failures = (sent?.targets ?? []).flatMap((ticket) => {
		const detail = results[ticket.id];
		return typeof detail === "string" ? [{ identifier: ticket.identifier, detail }] : [];
	});

	const toggle = (id: string, checked: boolean) =>
		setSelected((current) => {
			const next = new Set(current);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	const selectReady = (checked: boolean) =>
		setSelected((current) => {
			const next = new Set(current);
			for (const ticket of ready) {
				if (checked) next.add(ticket.id);
				else next.delete(ticket.id);
			}
			return next;
		});
	const start = async () => {
		if (submitting.current || !assignmentReady || targets.length === 0) return;
		submitting.current = true;
		const request = sent ?? { tickets, assigned, targets, harness };
		setSent(request);
		onStartingChange(true);
		const requestedIds = new Set(targets.map((ticket) => ticket.id));
		setResults((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !requestedIds.has(id))));
		await startWave(targets, {
			start: (ticket) =>
				client.agentRuns.start({
					ticket: ticket.identifier,
					harness: request.harness,
					requestId: `${batch}:${ticket.id}`,
				}),
			showRun: (run) =>
				queryClient.setQueryData(orpc.agentRuns.list.queryOptions({ input: { assigned: true } }).queryKey, (current) =>
					startedRunList(current, run),
				),
			report: (id, error) => setResults((current) => ({ ...current, [id]: error })),
		});
		submitting.current = false;
		onStartingChange(false);
		void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
	};

	const row = ({ ticket, children }: WaveBranch): WaveStartTicket => {
		const waitsOn = unfinishedDependencies(ticket).map((dependency) => dependency.identifier);
		const checked = chosen.has(ticket.id);
		const prerequisite = waitsOn.length > 0 ? `Waits for ${waitsOn.join(", ")}.` : "";
		let note: string | null =
			assignment.status === "loading"
				? `Trellis is checking current assignments.${prerequisite ? ` ${prerequisite}` : ""}`
				: assignment.status === "error"
					? `Current assignments did not load.${prerequisite ? ` ${prerequisite}` : ""}`
					: held.has(ticket.id)
						? `An agent is already assigned.${prerequisite ? ` ${prerequisite}` : ""}`
						: ticket.status.category !== "todo"
							? `Status: ${ticket.status.name}. Only Todo tickets can start.${prerequisite ? ` ${prerequisite}` : ""}`
							: ticket.ready
								? "Ready to start."
								: `${prerequisite} ${checked ? "Selected to start now." : "Select to start now."}`;
		let tone: WaveStartTicket["tone"] = "muted";
		if (!ticket.ready && ticket.status.category === "todo" && !held.has(ticket.id)) tone = "warning";
		if (sent && checked) {
			note =
				ticket.id in results
					? results[ticket.id] === null
						? `Agent assigned.${prerequisite ? ` ${prerequisite}` : ""}`
						: `Agent did not start. ${results[ticket.id]}${prerequisite ? ` ${prerequisite}` : ""}`
					: `Starting agent.${prerequisite ? ` ${prerequisite}` : ""}`;
			tone = ticket.id in results ? (results[ticket.id] === null ? "success" : "danger") : "muted";
		}
		return {
			id: ticket.id,
			identifier: ticket.identifier,
			title: ticket.title,
			status: {
				category: ticket.status.category,
				color: ticket.status.color,
				label: ticket.status.name,
				reviewShape: ticket.status.slug === "deploy-queue" ? "queue" : "human",
			},
			checked,
			disabled: !assignmentReady || sent !== null || ticket.status.category !== "todo" || held.has(ticket.id),
			waitsOn,
			note,
			tone,
			children: children.map(row),
		};
	};

	return (
		<WaveStartContent
			wave={wave}
			epic={displayed[0]?.epic?.name}
			tickets={waveTree(displayed).map(row)}
			total={displayed.length}
			selectedCount={targets.length}
			readyCount={ready.length}
			waitingCount={waiting.length}
			unavailableCount={displayed.length - eligible.length}
			readySelected={readySelected}
			assignedCount={assignedCount}
			failures={failures}
			starting={starting}
			submitted={sent !== null}
			canSelect={assignmentReady ? eligible.length > 0 : displayed.length > 0}
			assignmentStatus={assignment.status}
			assignmentError={assignment.status === "error" ? assignment.detail : undefined}
			onRetryAssignments={assignment.status === "error" ? assignment.retry : undefined}
			agent={<WaveLaunchFields harness={harness} onChange={setHarness} disabled={sent !== null || !assignmentReady} />}
			startLabel={assignmentReady ? startLabel(targets.length) : "Start wave"}
			onClose={onClose}
			onStart={() => void start()}
			onToggle={toggle}
			onSelectReady={selectReady}
		/>
	);
}
