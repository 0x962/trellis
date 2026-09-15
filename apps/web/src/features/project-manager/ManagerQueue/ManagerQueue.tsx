import { ArrowClockwise, Check, XCircle } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge, ConfirmDialog, EmptyState, IconButton, RecoveryDecisionDialog, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectSlashPath } from "../../../lib/projectPath";
import { recoveryError } from "../recoveryError";

const labels = {
	pending: "Queued",
	sending: "Send in progress",
	sent: "Written to agent",
	unknown: "Receipt unknown",
	cancelled: "Cancelled · receipt unknown",
};

export function ManagerQueue({ projectId, attentionOnly = false }: { projectId?: string; attentionOnly?: boolean }) {
	const { client, orpc, queryClient } = useApp();
	const queue = useQuery({
		...orpc.controller.list.queryOptions({ input: { projectId } }),
		refetchInterval: 2000,
		retry: false,
	});
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
	const [decision, setDecision] = useState<{ id: string; action: "retry" | "received" } | null>(null);
	const [cancelling, setCancelling] = useState<{ id: string; generation: number } | null>(null);
	const cancel = useMutation({
		mutationFn: (reason: string) =>
			client.controller.cancel({ id: cancelling!.id, expectedGeneration: cancelling!.generation, reason }),
		onSuccess: async () => {
			setCancelling(null);
			await queryClient.invalidateQueries({ queryKey: orpc.controller.list.key() });
			await queryClient.invalidateQueries({ queryKey: orpc.nativeMigration.inventory.key() });
		},
	});
	const action = useMutation({
		mutationFn: () =>
			decision!.action === "retry"
				? client.controller.retry({ id: decision!.id })
				: client.controller.resolveUnknown({ id: decision!.id }),
		onSuccess: async () => {
			setDecision(null);
			await queryClient.invalidateQueries({ queryKey: orpc.controller.list.key() });
		},
		onError: (error) => toast.error("Could not update the manager queue", { description: error.message }),
	});
	const rows =
		queue.data?.filter(
			(row) => !attentionOnly || (row.state !== "cancelled" && (row.state === "unknown" || row.error !== null)),
		) ?? [];
	if (attentionOnly && !queue.isPending && !queue.isError && rows.length === 0) return null;
	return (
		<section aria-label={attentionOnly ? "Manager needs attention" : "Manager queue"} className="flex flex-col gap-3">
			<h2 className="text-base font-medium">{attentionOnly ? "Manager needs attention" : "Manager queue"}</h2>
			{queue.isPending && (
				<p role="status" className="text-sm text-fg-muted">
					Load the manager queue…
				</p>
			)}
			{queue.isError && (
				<p role="alert" className="text-sm text-danger">
					{queue.error.message}
				</p>
			)}
			{!queue.isPending && !queue.isError && rows.length === 0 && (
				<EmptyState description="No manager deliveries are recorded." />
			)}
			<ul className="flex flex-col gap-3">
				{rows.map((row) => {
					const project = projects.data?.find((item) => item.id === row.projectId);
					return (
						<li key={row.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
							<div className="flex flex-wrap items-center gap-2">
								<span className="flex-1 text-sm font-medium">
									{project ? (
										<Link
											to="/p/$"
											params={{ _splat: `${projectSlashPath(project.path)}/settings/manager` }}
											search={{}}
										>
											{project.name}
										</Link>
									) : (
										"Project manager"
									)}
								</span>
								<Badge tone={row.state === "unknown" ? "bad" : "neutral"}>{labels[row.state]}</Badge>
							</div>
							<p className="text-sm text-fg-muted">
								{row.events.length} ticket {row.events.length === 1 ? "event" : "events"} · Due{" "}
								{new Date(row.dueAt).toLocaleString()}
							</p>
							{row.error && <p className="break-words text-sm text-danger">{row.error}</p>}
							{row.resolution?.kind === "cancelled" && (
								<p className="text-sm text-fg-muted">
									Cancelled by {row.resolution.actor.name}: {row.resolution.reason}. The receipt remains unknown.
								</p>
							)}
							{row.state === "unknown" && (
								<div className="flex items-center gap-2">
									<p className="flex-1 text-sm text-fg-muted">
										Inspect the manager output before you resend this message.
									</p>
									<Tooltip content="Confirm the manager received this message">
										<IconButton
											label="Confirm receipt"
											icon={<Check />}
											onClick={() => setDecision({ id: row.id, action: "received" })}
										/>
									</Tooltip>
									<Tooltip content="Cancel delivery and keep its unknown receipt">
										<IconButton
											label="Cancel delivery"
											icon={<XCircle />}
											onClick={() => {
												cancel.reset();
												setCancelling({ id: row.id, generation: row.generation });
											}}
										/>
									</Tooltip>
									<Tooltip content="Resend this message">
										<IconButton
											label="Resend message"
											icon={<ArrowClockwise />}
											onClick={() => setDecision({ id: row.id, action: "retry" })}
										/>
									</Tooltip>
								</div>
							)}
						</li>
					);
				})}
			</ul>
			{cancelling && (
				<RecoveryDecisionDialog
					kind="delivery"
					details={`Delivery: ${cancelling.id}\nGeneration: ${cancelling.generation}`}
					processing={cancel.isPending}
					error={recoveryError(cancel.error)}
					onConfirm={(reason) => cancel.mutate(reason)}
					onCancel={() => setCancelling(null)}
				/>
			)}
			<ConfirmDialog
				open={decision !== null}
				title={decision?.action === "retry" ? "Resend this message?" : "Confirm receipt?"}
				description={
					decision?.action === "retry"
						? "The first send may have reached the manager. A second send can repeat its work."
						: "Confirm only after the manager output shows this message. This clears the uncertain delivery."
				}
				confirmLabel={decision?.action === "retry" ? "Resend" : "Confirm receipt"}
				processing={action.isPending}
				onConfirm={() => action.mutate()}
				onCancel={() => setDecision(null)}
			/>
		</section>
	);
}
