import { ArrowClockwise, Play, Stop } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DEFAULT_PROJECT_MANAGER_CONFIG, type Project } from "@trellis/api";
import { Avatar, ConfirmDialog, EmptyState, IconButton, Tooltip, toast } from "@trellis/ui";
import { useCallback, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { hasAssignedProcess } from "../../agents/hasAssignedProcess";
import { isAgentWorking } from "../../agents/isAgentWorking";
import { NativeTerminal } from "../../agents/NativeTerminal";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { managerResumes } from "./managerResumes";
import { restartManager } from "./restartManager";

export function ProjectManagerPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const processControl = useRef<HTMLButtonElement>(null);
	const leaveTerminal = useCallback(() => processControl.current?.focus(), []);
	const [confirmNewSession, setConfirmNewSession] = useState(false);
	const saved = project.managerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG;
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { project: project.path } }),
		refetchInterval: 2000,
	});
	const manager = runs.data?.find((run) => run.kind === "manager");
	const active = manager !== undefined && hasAssignedProcess(manager);
	const resumes = managerResumes(manager);
	const readOnly = project.archivedAt !== null;
	const start = useMutation({
		mutationFn: (newSession: boolean) =>
			newSession && manager?.runtime === "native"
				? restartManager(client.agentRuns, { id: manager.id, project: project.path, personaId: saved.personaId! })
				: client.agentRuns.start({ project: project.path, personaId: saved.personaId!, newSession }),
		onSuccess: (run, newSession) => {
			setConfirmNewSession(false);
			const verb = newSession ? "restart" : resumes ? "resume" : "start";
			if (run.state === "failed") toast.error(`Could not ${verb} the manager`, { description: run.error ?? undefined });
			else toast.success(`${run.personaName} ${verb}s now`);
		},
		onError: (error, newSession) =>
			toast.error(`Could not ${newSession ? "restart" : "start"} the manager`, { description: error.message }),
		onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() }),
	});
	const stop = useMutation({
		mutationFn: () => client.agentRuns.stop({ id: manager!.id }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			toast.success(`${manager!.name} stops now`);
		},
		onError: (error) => toast.error("Could not stop the manager", { description: error.message }),
	});
	const startLabel = manager?.sessionLost ? "Start a new session" : resumes ? "Resume manager" : "Start manager";
	const controlsDisabled = readOnly || runs.isPending || runs.isError || start.isPending || stop.isPending;
	return (
		<>
			<Topbar
				actions={
					<>
						<Tooltip content={active ? "Stop the manager process" : startLabel}>
							<IconButton
								ref={processControl}
								label={active ? "Stop manager" : startLabel}
								icon={active ? <Stop weight="fill" /> : <Play weight="fill" />}
								disabled={controlsDisabled || (active ? manager.state === "starting" : !saved.personaId)}
								onClick={() => {
									if (active) stop.mutate();
									else if (manager?.sessionLost) setConfirmNewSession(true);
									else start.mutate(false);
								}}
							/>
						</Tooltip>
						{manager?.runtime === "native" && (
							<Tooltip content="Restart with new context">
								<IconButton
									label="Restart with new context"
									icon={<ArrowClockwise />}
									disabled={controlsDisabled || !saved.personaId || manager.state === "starting"}
									onClick={() => setConfirmNewSession(true)}
								/>
							</Tooltip>
						)}
					</>
				}
			>
				<PageTitle title="Manager" />
				{manager && (
					<span className="inline-flex min-w-0 items-center gap-2 text-sm text-fg-muted">
						<Avatar
							kind="agent"
							name={manager.personaName}
							personaKind="manager"
							state={isAgentWorking(manager) ? "working" : "static"}
							className="size-7"
						/>
						<span className="truncate">{manager.personaName}</span>
					</span>
				)}
			</Topbar>
			<section aria-label="Manager terminal" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{runs.isPending && (
					<p role="status" className="p-5 text-sm text-fg-muted">
						Load manager…
					</p>
				)}
				{runs.isError && (
					<div role="alert" className="flex items-center gap-3 p-5 text-sm text-danger">
						<p>Could not load manager. {runs.error.message}</p>
						<Tooltip content="Reload manager">
							<IconButton label="Reload manager" icon={<ArrowClockwise />} onClick={() => void runs.refetch()} />
						</Tooltip>
					</div>
				)}
				{!runs.isPending &&
					!runs.isError &&
					(manager?.runtime === "native" && manager.terminalId !== null ? (
						<NativeTerminal key={manager.terminalId} run={manager} layout="fill" onLeave={leaveTerminal} />
					) : (
						<EmptyState
							variant="page"
							title={manager?.error ? "The manager could not start" : "No manager session"}
							description={
								manager?.error ??
								(saved.personaId ? "Press Play to start the manager." : "Choose a manager persona in project settings.")
							}
						/>
					))}
			</section>
			<ConfirmDialog
				open={confirmNewSession}
				title="Restart manager with new context?"
				description="This stops the manager and starts a fresh conversation with the latest saved persona and project instructions. The workers and workspace stay unchanged."
				confirmLabel="Restart with new context"
				danger
				processing={start.isPending}
				onConfirm={() => {
					if (!controlsDisabled && saved.personaId) start.mutate(true);
				}}
				onCancel={() => {
					if (!start.isPending) setConfirmNewSession(false);
				}}
			/>
		</>
	);
}
