import { ArrowClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Epic, EpicWhiteboardSnapshot, Project, EpicWhiteboard as WhiteboardDocument } from "@trellis/api";
import { ConfirmDialog, FailureState, FormStatus, IconButton, Skeleton, Tooltip } from "@trellis/ui";
import type { EpicWhiteboardProps } from "@trellis/ui/epic-whiteboard";
import { lazy, Suspense, useEffect, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useTheme } from "../../../../../lib/theme";
import { pageSheetActions } from "../../../../../stores/pageSheetStore";
import { CardContent } from "../../../../board/components/CardContent";
import { composerActions } from "../../../../composer/composerStore";
import type { View } from "../../../../filters/grammar";
import type { WaveEditing } from "../../../../table/hooks/useWaveEditing";
import type { WaveStartAssignmentState } from "../../../../table/TicketTable/useWaveStart";
import { useEpicWhiteboardWaves } from "./EpicWhiteboardWaves";
import { useWhiteboardConnections } from "./useWhiteboardConnections";
import { useWhiteboardMatches } from "./useWhiteboardMatches";
import { useWhiteboardOutputs } from "./useWhiteboardOutputs";
import { useWhiteboardSessions } from "./useWhiteboardSessions";
import { useWhiteboardWaves } from "./useWhiteboardWaves";
import { whiteboardDraft } from "./whiteboardDraft";

const Canvas = lazy(() => import("@trellis/ui/epic-whiteboard").then((module) => ({ default: module.EpicWhiteboard })));
type Props = {
	epic: Epic;
	project: Project;
	search: Partial<View>;
	editing: WaveEditing;
	assignment: WaveStartAssignmentState;
	readOnly: boolean;
};

function Board({ initial, ...props }: Props & { initial: WhiteboardDocument }) {
	const { client, orpc, queryClient } = useApp();
	const { resolved } = useTheme();
	const [reload, setReload] = useState(false);
	const [ticketPlacements, setTicketPlacements] = useState<EpicWhiteboardProps["ticketPlacements"]>([]);
	const [draft] = useState(() => {
		const beforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		return whiteboardDraft(
			client,
			props.epic.id,
			initial,
			async (snapshot, expectedRevision) => {
				const result = await client.epics.saveWhiteboard({ epic: props.epic.id, snapshot, expectedRevision });
				queryClient.setQueryData(orpc.epics.whiteboard.queryKey({ input: { epic: props.epic.id } }), {
					snapshot,
					revision: result.revision,
				});
				return result;
			},
			(blocked) => {
				if (blocked) window.addEventListener("beforeunload", beforeUnload);
				else window.removeEventListener("beforeunload", beforeUnload);
			},
		);
	});
	const [saved, setSaved] = useState(draft.state);
	const [initialSnapshot] = useState(draft.snapshot);
	useEffect(() => draft.subscribe(setSaved), [draft]);
	const waveContent = useEpicWhiteboardWaves(props.epic, props.editing, props.assignment, props.readOnly);
	const filters = useWhiteboardMatches(props.project, props.epic.ref, props.search);
	const connections = useWhiteboardConnections(props.readOnly);
	const waveCreation = useWhiteboardWaves(props.epic, props.readOnly);
	const sessionCreation = useWhiteboardSessions(props.epic.projectKey, props.readOnly);
	const outputs = useWhiteboardOutputs(props.epic);
	const tickets = props.epic.tickets.map((ticket) => ({
		id: ticket.id,
		label: ticket.identifier,
		waveId: ticket.wave?.id ?? null,
		matched: filters.matches === null || filters.matches.has(ticket.id),
		waitsOn: ticket.waitsOn
			.map((dependency) => props.epic.tickets.find((entry) => entry.identifier === dependency.identifier)?.id)
			.filter((id): id is string => id !== undefined),
		content: <CardContent ticket={ticket} showStatus compactLabels interactive={false} readOnly={props.readOnly} />,
	}));
	const onReload = async () => {
		await queryClient.fetchQuery(orpc.epics.whiteboard.queryOptions({ input: { epic: props.epic.id }, staleTime: 0 }));
		draft.discard();
		window.location.reload();
	};
	return (
		<>
			<div className="flex shrink-0 items-center justify-between gap-3 px-5 py-2">
				<p className="text-xs text-fg-muted">
					{filters.filtered
						? `${filters.matches?.size ?? "…"} match the filters. Other tickets stay on the board.`
						: "T: ticket. S: session. W: wave from selection. X: dependency. Shift+T: text. A: sketch arrow."}
				</p>
				<FormStatus status={saved.status} message={props.readOnly ? "Read only" : undefined} />
			</div>
			{filters.error && (
				<FailureState variant="section" title="Ticket filters did not load." detail={filters.error.message} />
			)}
			{connections.error && (
				<FailureState variant="section" title="The dependency was not added." detail={connections.error.message} />
			)}
			{sessionCreation.error && (
				<FailureState variant="section" title="Session details did not load." detail={sessionCreation.error.message} />
			)}
			{outputs.error && (
				<FailureState variant="section" title="Some outputs did not load." detail={outputs.error.message} />
			)}
			{saved.error && (
				<FailureState
					title="The whiteboard did not save."
					description="Your changes remain in this view. Reload replaces them with the host copy."
					detail={saved.error.message}
					action={
						<Tooltip content="Reload whiteboard">
							<IconButton label="Reload whiteboard" icon={<ArrowClockwise />} onClick={() => setReload(true)} />
						</Tooltip>
					}
				/>
			)}
			<Suspense fallback={<Skeleton width="w-full" height="h-64" />}>
				<Canvas
					documentKey={props.epic.id}
					snapshot={initialSnapshot as EpicWhiteboardProps["snapshot"]}
					waves={waveContent.waves}
					tickets={tickets}
					readOnly={props.readOnly}
					colorScheme={resolved}
					focusWaveId={props.editing.renamingId}
					licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
					ticketPlacements={ticketPlacements}
					onConnectTickets={connections.connect}
					onCreateWave={waveCreation.select}
					wavePlacements={waveCreation.placements}
					onWavesPlaced={waveCreation.placed}
					waveDraft={waveCreation.draft}
					sessions={[...sessionCreation.sessions, ...outputs.sessions]}
					onSessionReferencesChange={outputs.setBareRunIds}
					outputs={outputs.outputs}
					outputLinks={outputs.links}
					outputsReady={outputs.ready}
					onOpenOutput={outputs.open}
					subagent={outputs.subagent}
					subagentLoad={outputs.subagentLoad}
					onCreateSession={sessionCreation.create}
					onOpenSession={pageSheetActions.openSession}
					sessionPlacements={sessionCreation.placements}
					onSessionsPlaced={sessionCreation.placed}
					onTicketsPlaced={(ids) =>
						setTicketPlacements((pending) => pending.filter((point) => !ids.includes(point.ticketId)))
					}
					onCreateTicket={(point, waveId) => {
						composerActions.open({
							project: props.epic.projectKey,
							epic: props.epic.ref,
							wave: props.epic.waves.find((wave) => wave.id === waveId)?.ref,
							applyPlacement: true,
							allowLoose: true,
							onCreated: (ticket) => {
								if (ticket.epic?.id === props.epic.id)
									setTicketPlacements((pending) => [...pending, { ticketId: ticket.id, ...point }]);
							},
						});
					}}
					onOpenTicket={(id) =>
						pageSheetActions.openTicket(props.epic.tickets.find((ticket) => ticket.id === id)!.identifier)
					}
					onDocumentChange={(snapshot) => {
						if (!props.readOnly) draft.change(snapshot as unknown as EpicWhiteboardSnapshot);
					}}
				/>
			</Suspense>
			{waveContent.dialog}
			<ConfirmDialog
				open={reload}
				title="Reload the whiteboard?"
				description="This replaces your unsaved changes with the host copy."
				confirmLabel="Reload"
				onCancel={() => setReload(false)}
				onConfirm={() => void onReload()}
			/>
		</>
	);
}

export function EpicWhiteboard(props: Props) {
	const { orpc } = useApp();
	const board = useQuery(orpc.epics.whiteboard.queryOptions({ input: { epic: props.epic.id } }));
	if (board.isPending)
		return (
			<div className="p-5" aria-busy="true">
				<Skeleton width="w-full" height="h-64" />
			</div>
		);
	if (board.isError && board.data === undefined)
		return (
			<FailureState
				variant="page"
				title="The whiteboard did not load."
				detail={board.error.message}
				action={
					<Tooltip content="Reload whiteboard">
						<IconButton label="Reload whiteboard" icon={<ArrowClockwise />} onClick={() => void board.refetch()} />
					</Tooltip>
				}
			/>
		);
	return <Board key={props.epic.id} {...props} initial={board.data} />;
}
