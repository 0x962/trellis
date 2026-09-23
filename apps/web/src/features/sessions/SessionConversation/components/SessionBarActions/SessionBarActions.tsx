import { Play, Stop, Ticket } from "@phosphor-icons/react";
import type { AgentRun, AgentWorkspaceSummary, Session } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { SessionActionsMenu } from "../../../SessionActionsMenu";
import { SessionDetails } from "../SessionDetails";

export type SessionBarActionsProps = {
	run: AgentRun;
	session?: Session;
	// Undefined while the first read of the workspace runs.
	summary: AgentWorkspaceSummary | undefined;
	// True while the process of the run is assigned, which makes the play
	// control a stop control.
	active: boolean;
	// True while a start or a stop still runs.
	busy: boolean;
	readOnly: boolean;
	onOpenTicket?: () => void;
	onStart: () => void;
	onStop: () => void;
	onRename?: () => void;
	onDeleted?: () => void;
};

// The controls on the right of the conversation bar: the session details,
// the ticket of the run, the play control and the session menu. They are
// the same shipped controls the top bar of every other page draws: a
// `default` icon button for each one, and the `primary` icon button, which
// the `metal` utility of `packages/ui/src/base.css` paints as brushed
// silver, for the play control, because a bar has one raised control.
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
	onStop,
	onRename,
	onDeleted,
}: SessionBarActionsProps) {
	const stopLabel = run.kind === "agent" ? "Remove assignment" : "Stop session";
	const playLabel = active ? stopLabel : "Resume session";
	return (
		<>
			{run.runtime === "native" && run.workspaceId !== null && (
				<SessionDetails barSlot="session-details" run={run} summary={summary} />
			)}
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
					icon={active ? <Stop /> : <Play />}
					disabled={
						readOnly ||
						busy ||
						run.runtime !== "native" ||
						run.state === "starting" ||
						(!active && !session && !run.terminalId)
					}
					onClick={active ? onStop : onStart}
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
			/>
		</>
	);
}
