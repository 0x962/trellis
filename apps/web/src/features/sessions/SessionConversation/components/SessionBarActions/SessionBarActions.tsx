import { Pause, Play, Ticket } from "@phosphor-icons/react";
import type { AgentRun, AgentWorkspaceSummary, Session } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { SessionActionsMenu } from "../../../SessionActionsMenu";
import { canStartAgent, isSessionArchived } from "../../../sessionPane";
import { SessionDetails } from "../SessionDetails";

export type SessionBarActionsProps = {
	run: AgentRun;
	session?: Session;
	// Undefined while the first read of the workspace runs.
	summary: AgentWorkspaceSummary | undefined;
	// True while the process of the run is assigned, which makes the play
	// control a pause control.
	active: boolean;
	// True while a start or a pause still runs. The play control draws a
	// turning ring in place of its icon and takes no second click.
	busy: boolean;
	readOnly: boolean;
	onOpenTicket?: () => void;
	onStart: () => void;
	onPause: () => void;
	onRename?: () => void;
	onDeleted?: () => void;
};

// The controls on the right of the conversation bar: the ticket of the run,
// the play control and the session menu. They are the same shipped controls
// the top bar of every other page draws: a `default` icon button for each
// one, and the `primary` icon button, which the `metal` utility of
// `packages/ui/src/base.css` paints as brushed silver, for the play
// control, because a bar has one raised control.
//
// The play control is the one control that stops and starts the process.
// The pane under this bar draws no second one, so a person reads one place
// for that action.
//
// Each control names its box with `data-bar-slot`. A test reads those names
// in order and proves that the bar puts the same controls in the same
// places whether or not the workspace of the run has been read, so no
// control slides sideways under the pointer.
export function SessionBarActions({
	run,
	session,
	summary,
	active,
	busy,
	readOnly,
	onOpenTicket,
	onStart,
	onPause,
	onRename,
	onDeleted,
}: SessionBarActionsProps) {
	const [detailsOpen, setDetailsOpen] = useState(false);
	const playLabel = active ? "Pause session" : "Resume session";
	const hasWorkspace = run.runtime === "native" && run.workspaceId !== null;
	return (
		<>
			{onOpenTicket && run.ticketIdentifier && (
				<Tooltip content={`Open ${run.ticketIdentifier}`}>
					<IconButton
						data-bar-slot="open-ticket"
						variant="default"
						label={`Open ${run.ticketIdentifier}`}
						icon={<Ticket />}
						onClick={onOpenTicket}
					/>
				</Tooltip>
			)}
			<Tooltip content={playLabel}>
				<IconButton
					data-bar-slot="play"
					variant="primary"
					label={playLabel}
					icon={active ? <Pause weight="fill" /> : <Play weight="fill" />}
					processing={busy}
					disabled={
						readOnly ||
						(active
							? run.runtime !== "native" || run.state === "starting"
							: !canStartAgent(run, session !== undefined, isSessionArchived(session)))
					}
					onClick={active ? onPause : onStart}
				/>
			</Tooltip>
			<SessionActionsMenu
				barSlot="session-actions"
				variant="default"
				run={run}
				session={session}
				deleteDisabled={readOnly || busy}
				onDeleted={onDeleted}
				onRename={onRename}
				onSessionDetails={hasWorkspace ? () => setDetailsOpen(true) : undefined}
			/>
			{hasWorkspace && (
				<SessionDetails run={run} summary={summary} open={detailsOpen} onOpenChange={setDetailsOpen} />
			)}
		</>
	);
}
