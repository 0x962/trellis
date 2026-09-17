import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PROJECT_MANAGER_CONFIG } from "@trellis/api";
import { Dialog, IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { AssignmentForm } from "./components/AssignmentForm";

export function PersonaPicker({ ticket, disabled }: { ticket: string; disabled: boolean }) {
	const { orpc } = useApp();
	const [open, setOpen] = useState(false);
	const detail = useQuery({ ...orpc.tickets.get.queryOptions({ input: { ticket } }), enabled: open });
	const project = useQuery({
		...orpc.projects.get.queryOptions({ input: { project: detail.data?.project.path ?? "" } }),
		enabled: open && detail.data !== undefined,
	});
	const ready = project.data !== undefined;
	const error = detail.error ?? project.error;
	const builder = project.data?.statuses.find((status) => status.id === detail.data?.status.id)?.agentConfig;
	return (
		<>
			<Tooltip content="Add persona">
				<IconButton label="Add persona" icon={<Plus />} disabled={disabled} onClick={() => setOpen(true)} />
			</Tooltip>
			<Dialog
				open={open}
				onOpenChange={setOpen}
				title="Assign an agent"
				description="Choose the persona and launch settings for this ticket."
			>
				{error ? (
					<p role="alert" className="text-sm text-danger">
						{error.message}
					</p>
				) : !ready ? (
					<p role="status" className="text-sm text-fg-muted">
						Load assignment settings…
					</p>
				) : (
					<AssignmentForm
						ticket={ticket}
						defaults={
							builder ?? {
								personaId: null,
								harness: project.data!.managerConfig?.harness ?? DEFAULT_PROJECT_MANAGER_CONFIG.harness,
							}
						}
						onClose={() => setOpen(false)}
					/>
				)}
			</Dialog>
		</>
	);
}
