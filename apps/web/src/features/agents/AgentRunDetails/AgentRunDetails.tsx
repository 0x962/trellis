import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Avatar, Badge, Button, ConfirmDialog, toast } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentTerminal } from "../AgentTerminal";

export type AgentRunDetailsProps = {
	// The agent as the caller last read it. The list refetches, so the row
	// here follows the runner without the caller passing it again.
	run: AgentRun;
	// True makes the agent's picture and name the heading of the block, with
	// its state at the far end of that row. The sheet puts the name in its
	// own title bar, so it leaves this off and takes the plain state row.
	heading?: boolean;
	// False leaves out the Stop agent control. The manager page pauses and
	// starts its manager from its header, so it shows none here.
	controls?: boolean;
};

// How often the page asks the server to read the agent's terminal again,
// in ms.
const followEveryMs = 15000;

// Everything one agent shows: its state, what the runner said, its terminal
// output, the follow-up box, and the controls that stop it or open its
// workspace. The state and the output both follow the agent on their own.
export function AgentRunDetails({ run: initial, heading = false, controls = true }: AgentRunDetailsProps) {
	const { client, orpc, queryClient } = useApp();
	const query = useQuery(orpc.agentRuns.list.queryOptions({ input: {} }));
	const run = query.data?.find((item) => item.id === initial.id) ?? initial;
	const [confirmStop, setConfirmStop] = useState(false);
	const stop = useMutation({
		mutationFn: () => client.agentRuns.stop({ id: run.id }),
		onSuccess: async () => {
			setConfirmStop(false);
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			toast.success(`${run.name} stops now`);
		},
		onError: (error) => toast.error("Could not stop the agent", { description: error.message }),
	});
	const active = run.state === "running" || run.state === "starting" || run.state === "interrupted";

	// The server learns that a terminal exited only when somebody asks it, so
	// the page asks while it is open and the agent is at work. The answer
	// updates the row, and the state above follows with no button to press.
	// A hidden tab asks nothing.
	useEffect(() => {
		if (!active) return;
		const handle = setInterval(() => {
			if (document.visibilityState !== "visible") return;
			void client.agentRuns.refresh({ id: run.id }).then(() => {
				void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			});
		}, followEveryMs);
		return () => clearInterval(handle);
	}, [active, run.id, client, queryClient, orpc]);
	return (
		<div className="flex min-w-0 flex-col gap-6">
			{heading ? (
				<header className="project-settings-heading">
					<div className="flex min-w-0 items-center gap-3">
						<Avatar kind="agent" name={run.name} live={active} />
						<div className="min-w-0">
							<h2 className="truncate text-xl font-semibold text-fg">{run.name}</h2>
							<p className="mt-1 truncate text-sm text-fg-muted">
								{run.personaName} · {run.ticketIdentifier ?? run.projectPath}
							</p>
						</div>
					</div>
					<Badge>{run.state}</Badge>
				</header>
			) : (
				<>
					<div className="flex flex-wrap items-center gap-2">
						<Badge>{run.state}</Badge>
						<span className="text-sm text-fg-muted">
							{run.personaName} · {run.kind}
						</span>
					</div>
					<p className="text-sm text-fg-muted">{run.ticketIdentifier ?? run.projectPath}</p>
				</>
			)}
			{run.error && (
				<p role="alert" className="break-words text-sm text-danger">
					{run.error}
				</p>
			)}
			<AgentTerminal run={run} />
			<div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
				{controls && (active || (run.state === "failed" && run.workspaceId)) && (
					<Button
						variant="quiet"
						disabled={run.state === "starting"}
						processing={stop.isPending}
						onClick={() => setConfirmStop(true)}
					>
						Stop agent
					</Button>
				)}
				{run.url && (
					<a
						href={run.url}
						className="ml-auto inline-flex min-h-7 items-center rounded-md border border-border px-3 text-sm text-accent hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
					>
						Open workspace
					</a>
				)}
			</div>
			<ConfirmDialog
				open={confirmStop && (active || run.state === "failed")}
				title={`Stop ${run.name}?`}
				description="The workspace and its files stay available."
				confirmLabel="Stop agent"
				danger
				processing={stop.isPending}
				onConfirm={() => stop.mutate()}
				onCancel={() => setConfirmStop(false)}
			/>
		</div>
	);
}
