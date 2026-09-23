import { useMutation, useQuery } from "@tanstack/react-query";
import { type Flow, type FlowCreateInput, FlowCreateInputSchema } from "@trellis/api";
import { Button, Dialog, Input, Select } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { everyProject, flowProjectItems, flowProjectRef } from "../../../flowProject";

type NewFlowDialogProps = { onClose: () => void; onCreated: (flow: Flow) => void };

// The server takes a slug from the name, so the dialog asks for the name,
// the description, and the project. `trellis ready` asks a pull request for
// the flows of its ticket's project.
export function NewFlowDialog({ onClose, onCreated }: NewFlowDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [project, setProject] = useState(everyProject);
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
	const input = FlowCreateInputSchema.safeParse({
		name,
		description,
		project: flowProjectRef(project) ?? undefined,
	});
	const create = useMutation({
		mutationFn: (fields: FlowCreateInput) => client.flows.create(fields),
		onSuccess: async (flow) => {
			await queryClient.invalidateQueries({ queryKey: orpc.flows.list.key() });
			onCreated(flow);
		},
	});

	return (
		<Dialog open title="New flow" onOpenChange={(open) => !open && !create.isPending && onClose()}>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (input.success && !create.isPending) create.mutate(input.data);
				}}
			>
				<Input
					label="Name"
					required
					autoComplete="off"
					maxLength={120}
					disabled={create.isPending}
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
				<Input
					label="Description"
					autoComplete="off"
					maxLength={2000}
					disabled={create.isPending}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
				/>
				<div className="flex min-w-0 flex-col gap-2">
					<span className="text-sm text-fg-muted">Project</span>
					<Select
						label="Project"
						value={project}
						items={flowProjectItems(projects.data ?? [])}
						disabled={create.isPending}
						onValueChange={setProject}
					/>
				</div>
				{create.isError && (
					<p role="alert" className="text-sm text-danger">
						Could not create the flow. {create.error.message}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button type="button" variant="quiet" disabled={create.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={!input.success || create.isPending}
						aria-busy={create.isPending}
					>
						Create flow
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
