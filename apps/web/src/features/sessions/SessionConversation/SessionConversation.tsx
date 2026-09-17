import { Play, Stop, Ticket, Trash } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { AgentRun, Session } from "@trellis/api";
import { Avatar, ConfirmDialog, EmptyState, IconButton, Tooltip } from "@trellis/ui";
import { useCallback, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { agentKindOf } from "../../agents/agentKindOf";
import { agentProfileOf } from "../../agents/agentProfileOf";
import { hasAssignedProcess } from "../../agents/hasAssignedProcess";
import { isAgentWorking } from "../../agents/isAgentWorking";
import { NativeTerminal } from "../../agents/NativeTerminal";
import { DeleteSessionDialog } from "../DeleteSessionDialog";
import { SessionPrompt } from "../SessionPrompt";
import { changeSessionMessage, useSessionMessageStore } from "../sessionMessageStore";

export function SessionConversation({
	run,
	session,
	readOnly = false,
	onDeleted,
	onOpenTicket,
}: {
	run: AgentRun;
	session?: Session;
	readOnly?: boolean;
	onDeleted?: () => void;
	onOpenTicket?: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const draft = useSessionMessageStore((state) => state[run.id]);
	const files = draft?.files ?? [];
	const [confirmStop, setConfirmStop] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const control = useRef<HTMLButtonElement>(null);
	const leaveTerminal = useCallback(() => control.current?.focus(), []);
	const text = draft?.text ?? "";
	const setText = (text: string) => {
		changeSessionMessage(run.id, { text });
	};
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
	const send = useMutation({
		mutationFn: () =>
			client.sessions.send({
				runId: run.id,
				expectedTerminalId: run.terminalId!,
				text,
				files,
				messageId: useSessionMessageStore.getState()[run.id]!.messageId,
			}),
		onSuccess: () => {
			changeSessionMessage(run.id, { text: "", files: [] });
		},
		onSettled: refresh,
	});
	const busy = start.isPending || stop.isPending || send.isPending;
	const error = start.error ?? stop.error ?? send.error;
	const name = run.ticketIdentifier ?? run.name;
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
				<span className="min-w-0 flex-1 truncate text-sm font-medium tabular">{name}</span>
				<span className="text-xs text-fg-muted">{run.state}</span>
				{onOpenTicket && run.ticketIdentifier && (
					<Tooltip content={`Open ${run.ticketIdentifier}`}>
						<IconButton label={`Open ${run.ticketIdentifier}`} icon={<Ticket />} onClick={onOpenTicket} />
					</Tooltip>
				)}
				<Tooltip content={active ? (run.kind === "agent" ? "Remove assignment" : "Stop session") : "Resume session"}>
					<IconButton
						ref={control}
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
			<div className="shrink-0 border-t border-border">
				<SessionPrompt
					text={text}
					files={files}
					onText={setText}
					onFiles={(files) => changeSessionMessage(run.id, { files })}
					disabled={readOnly || busy || !active || run.observation?.controllable !== true}
					onSubmit={() => {
						if (!busy && active && (text.trim() || files.length)) {
							if (!draft) changeSessionMessage(run.id);
							send.mutate();
						}
					}}
				/>
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
