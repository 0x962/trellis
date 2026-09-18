import { Play, Stop, Ticket, Trash } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { AgentRun, Session } from "@trellis/api";
import { Avatar, ConfirmDialog, EmptyState, IconButton, Tooltip } from "@trellis/ui";
import { type RefObject, useCallback, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { agentKindOf } from "../../agents/agentKindOf";
import { agentProfileOf } from "../../agents/agentProfileOf";
import { hasAssignedProcess } from "../../agents/hasAssignedProcess";
import { isAgentWorking } from "../../agents/isAgentWorking";
import { NativeTerminal } from "../../agents/NativeTerminal";
import { DeleteSessionDialog } from "../DeleteSessionDialog";
import { sessionStateLabel } from "../sessionStateLabel";

export function SessionConversation({
	run,
	session,
	readOnly = false,
	onDeleted,
	onOpenTicket,
	headingRef,
}: {
	run: AgentRun;
	session?: Session;
	readOnly?: boolean;
	onDeleted?: () => void;
	onOpenTicket?: () => void;
	headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
	const { client, orpc, queryClient } = useApp();
	const [confirmStop, setConfirmStop] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const localHeading = useRef<HTMLHeadingElement>(null);
	const heading = headingRef ?? localHeading;
	const leaveTerminal = useCallback(() => heading.current?.focus(), [heading]);
	const active = hasAssignedProcess(run);
	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
			queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
		]);
	const start = useMutation({
		mutationFn: async () => {
			if (session) await client.sessions.start({ id: session.id });
			else
				await client.agentRuns.resume({
					id: run.id,
					expectedTerminalId: run.terminalId!,
					requestId: crypto.randomUUID(),
				});
		},
		onSettled: refresh,
	});
	const stop = useMutation({
		mutationFn: () => client.agentRuns.stop({ id: run.id }),
		onSuccess: () => setConfirmStop(false),
		onSettled: refresh,
	});
	const busy = start.isPending || stop.isPending;
	const error = start.error ?? stop.error;
	const name = run.ticketTitle ?? run.name;
	return (
		<section aria-label={`${name} conversation`} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3">
				<Avatar
					kind="agent"
					name={name}
					agentKind={agentKindOf(run.kind)}
					agentProfile={agentProfileOf(run.harness)}
					state={isAgentWorking(run) ? "working" : "static"}
					className="size-7 shrink-0"
				/>
				<h2
					ref={heading}
					tabIndex={-1}
					title={name}
					className="min-w-0 flex-1 truncate rounded-sm text-sm font-medium tabular focus-visible:outline-2 focus-visible:outline-accent"
				>
					{name}
				</h2>
				<span className="text-xs text-fg-muted">{sessionStateLabel(run)}</span>
				{onOpenTicket && run.ticketIdentifier && (
					<Tooltip content={`Open ${run.ticketIdentifier}`}>
						<IconButton label={`Open ${run.ticketIdentifier}`} icon={<Ticket />} onClick={onOpenTicket} />
					</Tooltip>
				)}
				<Tooltip content={active ? (run.kind === "agent" ? "Remove assignment" : "Stop session") : "Resume session"}>
					<IconButton
						label={active ? (run.kind === "agent" ? "Remove assignment" : "Stop session") : "Resume session"}
						icon={active ? <Stop /> : <Play />}
						disabled={
							readOnly ||
							busy ||
							run.runtime !== "native" ||
							run.state === "starting" ||
							(!active && !session && !run.terminalId)
						}
						onClick={() => {
							if (active) setConfirmStop(true);
							else start.mutate();
						}}
					/>
				</Tooltip>
				{session && (
					<Tooltip content="Delete session">
						<IconButton
							label="Delete session"
							icon={<Trash />}
							disabled={readOnly || busy}
							onClick={() => setConfirmDelete(true)}
						/>
					</Tooltip>
				)}
			</div>
			{(error || run.error) && (
				<p role="alert" className="px-3 py-2 text-sm text-danger">
					{error?.message ?? run.error}
				</p>
			)}
			<div className="flex min-h-0 flex-1 flex-col">
				{run.terminalId ? (
					<NativeTerminal key={run.terminalId} run={run} layout="fill" readOnly={readOnly} onLeave={leaveTerminal} />
				) : (
					<EmptyState variant="page" title="No session process" description="Start the session to open the agent." />
				)}
			</div>
			<ConfirmDialog
				open={confirmStop}
				title={run.kind === "agent" ? "Remove this assignment?" : `Stop ${name}?`}
				description="The workspace and its files stay available."
				confirmLabel={run.kind === "agent" ? "Remove assignment" : "Stop session"}
				danger
				processing={stop.isPending}
				onConfirm={() => stop.mutate()}
				onCancel={() => setConfirmStop(false)}
			/>
			{session && (
				<DeleteSessionDialog
					session={session}
					open={confirmDelete}
					onOpenChange={setConfirmDelete}
					onDeleted={onDeleted}
				/>
			)}
		</section>
	);
}
