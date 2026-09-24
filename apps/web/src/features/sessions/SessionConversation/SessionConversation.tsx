import { useMutation } from "@tanstack/react-query";
import { type AgentRun, hasAssignedProcess, type Session, sessionStatus } from "@trellis/api";
import { Avatar, Button, EmptyState, FailureState, toast } from "@trellis/ui";
import { type RefObject, useCallback, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { agentKindOf } from "../../agents/agentKindOf";
import { agentProfileOf } from "../../agents/agentProfileOf";
import { isAgentWorking } from "../../agents/isAgentWorking";
import { NativeTerminal } from "../../agents/NativeTerminal";
import { useWorkspaceSummary } from "../../agents/useWorkspaceSummary";
import { PendingQuestions } from "../PendingQuestions";
import { SessionName } from "../SessionName";
import { isSessionArchived, sessionPane } from "../sessionPane";
import { useSessionArchive } from "../useSessionArchive";
import { SessionBarActions } from "./components/SessionBarActions";
import { SessionMeta } from "./components/SessionMeta";

export function SessionConversation({
	run,
	session,
	readOnly = false,
	autoFocusTerminal = false,
	autoFocusTerminalDelay = 0,
	onDeleted,
	onOpenTicket,
	onLeaveTerminal,
	headingRef,
}: {
	run: AgentRun;
	session?: Session;
	readOnly?: boolean;
	autoFocusTerminal?: boolean;
	autoFocusTerminalDelay?: number;
	onDeleted?: () => void;
	onOpenTicket?: () => void;
	// What the terminal does when a person presses Escape two times, or
	// Control+]. The session sheet passes the action that closes the sheet.
	// Without it the focus moves to the name of the session above the
	// terminal.
	onLeaveTerminal?: () => void;
	headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
	const { client, orpc, queryClient } = useApp();
	const [renaming, setRenaming] = useState(false);
	const localHeading = useRef<HTMLHeadingElement>(null);
	const headingElement = headingRef ?? localHeading;
	const focusHeading = useCallback(() => headingElement.current?.focus(), [headingElement]);
	const leaveTerminal = onLeaveTerminal ?? focusHeading;
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
		onError: (failure) => toast(failure.message),
		onSettled: refresh,
	});
	const archive = useSessionArchive();
	// A pause stops the process and keeps the assignment, the conversation
	// and the workspace. The ticket page holds the action that ends an
	// assignment.
	const pause = useMutation({
		mutationFn: () => client.agentRuns.pause({ id: run.id }),
		onError: (failure) => toast(failure.message),
		onSettled: refresh,
	});
	// The line under the name is present for every native run, so the name
	// does not move when the workspace of a new run appears.
	const native = run.runtime === "native";
	const archived = isSessionArchived(session);
	// Nothing writes in the workspace of an archived session, so a repeat read
	// on window focus returns the numbers of the first read and runs git for
	// nothing.
	const summary = useWorkspaceSummary(run, { focus: !archived }).data;
	const busy = start.isPending || pause.isPending;
	const name = session?.name ?? run.ticketTitle ?? run.name;
	const heading = (
		<h2
			ref={headingElement}
			tabIndex={-1}
			title={name}
			className="truncate rounded-sm text-sm font-medium tabular focus-visible:outline-2 focus-visible:outline-accent"
			onDoubleClick={session ? () => setRenaming(true) : undefined}
		>
			{name}
		</h2>
	);
	const pane = sessionPane(run, archived);
	return (
		<section aria-label={`${name} conversation`} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3">
				<Avatar
					kind="agent"
					name={name}
					agentKind={agentKindOf(run.kind)}
					agentProfile={agentProfileOf(run.harness)}
					state={isAgentWorking(run) ? "working" : "static"}
					status={sessionStatus(run)}
					className="size-7 shrink-0"
				/>
				<div className="flex min-w-0 flex-1 flex-col">
					{session ? (
						<SessionName
							session={session}
							editing={renaming}
							onEditingChange={setRenaming}
							fieldClassName="max-w-80"
							inputClassName="h-7 text-sm font-medium"
						>
							{heading}
						</SessionName>
					) : (
						heading
					)}
					{native && <SessionMeta run={run} summary={summary} />}
				</div>
				<SessionBarActions
					run={run}
					session={session}
					summary={summary}
					active={active}
					busy={busy}
					readOnly={readOnly}
					onOpenTicket={onOpenTicket}
					onStart={() => start.mutate()}
					onPause={() => pause.mutate()}
					onRename={session ? () => setRenaming(true) : undefined}
					onDeleted={onDeleted}
				/>
			</div>
			{run.switchedTo && (
				<p role="status" className="px-3 py-2 text-xs text-fg-muted">
					Switched to {run.switchedTo}
				</p>
			)}
			<PendingQuestions run={run} readOnly={readOnly} />
			<div className="flex min-h-0 flex-1 flex-col">
				{pane.kind === "failed" ? (
					<FailureState variant="page" title={pane.title} description={pane.description} detail={pane.detail} />
				) : pane.kind === "archived" ? (
					<EmptyState
						variant="page"
						image={null}
						title={pane.title}
						description={pane.description}
						action={
							<Button
								size="md"
								processing={archive.isPending}
								onClick={() => archive.mutate({ session: session!, archived: false })}
							>
								Unarchive
							</Button>
						}
					/>
				) : pane.kind === "paused" ? (
					// The page variant draws the picture that every page-level state
					// of the app draws. A pause is no failure, so the block keeps it.
					<EmptyState variant="page" title={pane.title} description={pane.description} />
				) : run.terminalId ? (
					<NativeTerminal
						key={run.terminalId}
						run={run}
						layout="fill"
						readOnly={readOnly}
						autoFocus={autoFocusTerminal}
						autoFocusDelay={autoFocusTerminalDelay}
						onLeave={leaveTerminal}
					/>
				) : (
					<EmptyState
						variant="page"
						image={null}
						title="This session has no process"
						description="Trellis starts no process for this runtime."
					/>
				)}
			</div>
		</section>
	);
}
