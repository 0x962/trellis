import { Play, Stop, Trash } from "@phosphor-icons/react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, EmptyState, IconButton, Tooltip, toast } from "@trellis/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { hasAssignedProcess } from "../../agents/hasAssignedProcess";
import { isAgentWorking } from "../../agents/isAgentWorking";
import { NativeTerminal } from "../../agents/NativeTerminal";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { DeleteSessionDialog } from "../DeleteSessionDialog";
import { harnessLabel } from "../harnessLabel";

// One session: its name, the harness of its agent, the process controls,
// and the terminal. The page reads the session every two seconds, so the
// controls follow the process. Start resumes the saved conversation when
// the harness kept one, and otherwise starts the agent again from the
// prompt in the same directory.
export function SessionPage({ id }: { id: string }) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const processControl = useRef<HTMLButtonElement>(null);
	const leaveTerminal = useCallback(() => processControl.current?.focus(), []);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const options = orpc.sessions.get.queryOptions({ input: { id } });
	const session = useSuspenseQuery({ ...options, refetchInterval: 2000 }).data;
	const { run } = session;
	useEffect(() => {
		document.title = `${session.name} · trellis`;
	}, [session.name]);
	const active = hasAssignedProcess(run);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.sessions.key() });
	const start = useMutation({
		mutationFn: () => client.sessions.start({ id }),
		onSuccess: (next) => {
			queryClient.setQueryData(options.queryKey, next);
			if (next.run.state === "failed")
				toast.error("Could not start the session", { description: next.run.error ?? undefined });
			else toast.success(`${session.name} starts now`);
		},
		onError: (error) => toast.error("Could not start the session", { description: error.message }),
		onSettled: invalidate,
	});
	const stop = useMutation({
		mutationFn: () => client.agentRuns.stop({ id: run.id }),
		onSuccess: async () => {
			await invalidate();
			toast.success(`${session.name} stops now`);
		},
		onError: (error) => toast.error("Could not stop the session", { description: error.message }),
	});
	const busy = start.isPending || stop.isPending;
	return (
		<>
			<Topbar
				actions={
					<>
						<Tooltip content={active ? "Stop the agent" : "Start the agent"}>
							<IconButton
								ref={processControl}
								label={active ? "Stop session" : "Start session"}
								icon={active ? <Stop weight="fill" /> : <Play weight="fill" />}
								disabled={busy || (active && run.state === "starting")}
								onClick={() => {
									if (active) stop.mutate();
									else start.mutate();
								}}
							/>
						</Tooltip>
						<Tooltip content="Delete session">
							<IconButton
								label="Delete session"
								icon={<Trash />}
								disabled={busy}
								onClick={() => setConfirmDelete(true)}
							/>
						</Tooltip>
					</>
				}
			>
				<PageTitle title={session.name} />
				<span className="inline-flex min-w-0 items-center gap-2 text-sm text-fg-muted">
					<Avatar
						kind="agent"
						name={session.name}
						personaKind="builder"
						state={isAgentWorking(run) ? "working" : "static"}
						className="size-7"
					/>
					<span className="truncate">{harnessLabel(session.harness.preset)}</span>
				</span>
			</Topbar>
			<section aria-label="Session terminal" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{run.terminalId !== null ? (
					<NativeTerminal key={run.terminalId} run={run} layout="fill" onLeave={leaveTerminal} />
				) : (
					<EmptyState
						variant="page"
						title={run.error ? "The session could not start" : "No session process"}
						description={run.error ?? "Press Play to start the agent."}
					/>
				)}
			</section>
			<DeleteSessionDialog
				session={session}
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				onDeleted={() => void navigate({ to: "/needs-you" })}
			/>
		</>
	);
}
