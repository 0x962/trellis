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

export function WaveStartForm({
	wave,
	tickets,
	assigned,
	starting,
	onStartingChange,
	onClose,
}: {
	wave: string;
	tickets: readonly TicketSummary[];
	assigned: ReadonlySet<string>;
	starting: boolean;
	onStartingChange: (starting: boolean) => void;
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [harness, setHarness] = useState<Harness>(() => HarnessSchema.parse({ preset: "claude" }));
	const [batch] = useState(() => crypto.randomUUID());
	const [selected, setSelected] = useState(() => new Set(wavePlan(tickets, assigned).start.map((ticket) => ticket.id)));
	const [sent, setSent] = useState<Sent | null>(null);
	const [results, setResults] = useState<Record<string, string | null>>({});
	const submitting = useRef(false);
	const displayed = sent?.tickets ?? tickets;
	const held = sent?.assigned ?? assigned;
	const eligible = displayed.filter((ticket) => ticket.status.category === "todo" && !held.has(ticket.id));
	const ready = eligible.filter((ticket) => ticket.ready);
	const targets = sent
		? sent.targets.filter((ticket) => results[ticket.id] !== null)
		: eligible.filter((ticket) => selected.has(ticket.id));
	const chosen = new Set((sent?.targets ?? targets).map((ticket) => ticket.id));
	const readySelected = ready.filter((ticket) => chosen.has(ticket.id)).length;

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
		if (submitting.current || targets.length === 0) return;
		submitting.current = true;
		const request = sent ?? { tickets, assigned, targets, harness };
		setSent(request);
		onStartingChange(true);
		const requestedIds = new Set(targets.map((ticket) => ticket.id));
		setResults((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !requestedIds.has(id))));
		const accepted = await startWave(targets, {
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
		if (accepted) onClose();
	};

	const row = ({ ticket, children }: WaveBranch): WaveStartTicket => {
		const waitsOn = unfinishedDependencies(ticket).map((dependency) => dependency.identifier);
		const checked = chosen.has(ticket.id);
		let note: string | null = held.has(ticket.id)
			? "Already assigned"
			: ticket.status.category !== "todo"
				? ticket.status.name
				: null;
		let tone: WaveStartTicket["tone"] = "muted";
		if (note === null && waitsOn.length > 0) {
			note = `${checked ? "Starts anyway · " : ""}Waits for ${waitsOn.join(", ")}`;
			if (checked) tone = "warning";
		}
		if (sent && checked) {
			note =
				ticket.id in results ? (results[ticket.id] === null ? "Agent assigned" : results[ticket.id]!) : "Starting…";
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
			disabled: sent !== null || ticket.status.category !== "todo" || held.has(ticket.id),
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
			readySelected={readySelected}
			starting={starting}
			submitted={sent !== null}
			canSelect={eligible.length > 0}
			hasWaiting={eligible.some((ticket) => unfinishedDependencies(ticket).length > 0)}
			agent={<WaveLaunchFields harness={harness} onChange={setHarness} disabled={sent !== null} />}
			startLabel={
				sent ? `Retry ${targets.length} ${targets.length === 1 ? "ticket" : "tickets"}` : startLabel(targets.length)
			}
			onClose={onClose}
			onStart={() => void start()}
			onToggle={toggle}
			onSelectReady={selectReady}
		/>
	);
}
