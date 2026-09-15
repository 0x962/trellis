import { ArrowClockwise, Desktop, X } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { NativeMigrationInventory, Project, ProjectManagerConfig } from "@trellis/api";
import { Dialog, IconButton, NativeMigrationReview, RecoveryDecisionDialog, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { recoveryError } from "../recoveryError";

type Assignment = NativeMigrationInventory["agents"][number];
export function LocalExecutionRecovery({
	project,
	onMigrated,
	onRetired,
}: {
	project: Project;
	onMigrated: (config: ProjectManagerConfig) => void;
	onRetired: (dispatchPaused: boolean) => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const desktop = (window as Window & { trellisDesktop?: { chooseDirectory: () => Promise<string | null> } })
		.trellisDesktop;
	const [open, setOpen] = useState(false);
	const [directory, setDirectory] = useState(project.managerConfig?.directory ?? "");
	const [retiring, setRetiring] = useState<Assignment | null>(null);
	const [requestId, setRequestId] = useState(() => crypto.randomUUID());
	const inventory = useQuery({
		...orpc.nativeMigration.inventory.queryOptions({ input: { project: project.path } }),
		enabled: open,
		retry: false,
	});
	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: orpc.nativeMigration.inventory.key() }),
			queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() }),
			queryClient.invalidateQueries({ queryKey: orpc.projects.get.key() }),
		]);
	};
	const apply = useMutation({
		mutationFn: () =>
			client.nativeMigration.apply({
				project: project.path,
				directory,
				expectedVersion: inventory.data!.version,
				requestId,
			}),
		onSuccess: async (result) => {
			onMigrated(result.appliedConfig);
			setOpen(false);
			await refresh();
			toast.success("Local execution is paused. Review repository trust before you start work.");
		},
	});
	const retire = useMutation({
		mutationFn: () =>
			client.agentRuns.retireExternal({
				source: retiring!.source,
				id: retiring!.id,
				runtime: retiring!.runtime as "superset" | "tmux" | "commands",
				workspaceId: retiring!.workspaceId,
				terminalId: retiring!.terminalId,
				sessionId: retiring!.conversationId,
				externalProcessStopped: true,
			}),
		onSuccess: async () => {
			const updated = await client.projects.get({ project: project.path });
			onRetired(updated.managerConfig!.dispatchPaused);
			setRetiring(null);
			await refresh();
		},
	});
	return (
		<section aria-label="Local execution recovery" className="flex flex-col gap-3 rounded-md border border-border p-3">
			<div className="flex items-center gap-2">
				<h2 className="flex-1 text-base font-medium">Use local execution</h2>
				<Tooltip content="Preview local execution">
					<IconButton
						label="Use local execution"
						icon={<Desktop />}
						disabled={project.archivedAt !== null}
						onClick={() => {
							apply.reset();
							setRequestId(crypto.randomUUID());
							setOpen(true);
						}}
					/>
				</Tooltip>
			</div>
			<p className="text-sm text-fg-muted">
				Review external assignments and delivery blockers. Trellis keeps the project history and starts local execution
				paused.
			</p>
			<Dialog
				open={open}
				onOpenChange={(value) => !apply.isPending && !retire.isPending && setOpen(value)}
				title="Use local execution"
				header={
					<div className="flex items-center gap-2">
						<span className="flex-1 text-md font-semibold">Use local execution</span>
						<Tooltip content="Refresh migration preview">
							<IconButton
								label="Refresh migration preview"
								icon={<ArrowClockwise />}
								disabled={inventory.isFetching || apply.isPending || retire.isPending}
								onClick={() => {
									apply.reset();
									setRequestId(crypto.randomUUID());
									void inventory.refetch();
								}}
							/>
						</Tooltip>
						<Tooltip content="Close migration preview">
							<IconButton
								label="Close migration preview"
								icon={<X />}
								disabled={apply.isPending || retire.isPending}
								onClick={() => setOpen(false)}
							/>
						</Tooltip>
					</div>
				}
				size="lg"
			>
				{inventory.isPending && <p role="status">Load migration preview…</p>}
				{inventory.error && (
					<p role="alert" className="text-sm text-danger">
						{inventory.error.message}
					</p>
				)}
				{inventory.data && (
					<NativeMigrationReview
						key={inventory.data.version}
						version={inventory.data.version}
						directory={directory}
						agents={inventory.data.agents}
						blockers={inventory.data.blockers}
						processing={apply.isPending || retire.isPending}
						error={recoveryError(apply.error)}
						onDirectoryChange={setDirectory}
						onChooseDirectory={
							desktop
								? () => {
										void desktop.chooseDirectory().then((path) => {
											if (path) setDirectory(path);
										});
									}
								: undefined
						}
						onRetire={(id, source) => {
							retire.reset();
							setRetiring(inventory.data!.agents.find((agent) => agent.id === id && agent.source === source)!);
						}}
						onApply={() => apply.mutate()}
					/>
				)}
			</Dialog>
			{retiring && (
				<RecoveryDecisionDialog
					kind="assignment"
					details={`Assignment: ${retiring.id}\nRuntime: ${retiring.runtime}\nWorkspace: ${retiring.workspaceId ?? "Not recorded"}\nTerminal: ${retiring.terminalId ?? "Not recorded"}\nConversation: ${retiring.conversationId ?? "Not recorded"}`}
					processing={retire.isPending}
					error={recoveryError(retire.error)}
					onConfirm={() => retire.mutate()}
					onCancel={() => setRetiring(null)}
				/>
			)}
		</section>
	);
}
