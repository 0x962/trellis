import { useMutation } from "@tanstack/react-query";
import { type Flow, type FlowCreateInput, FlowCreateInputSchema } from "@trellis/api";
import { Button, Dialog, Input, Textarea } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { FlowProjectSelect, useFlowProjects } from "../../../FlowProjectSelect";
import { everyProjectValue, projectRefOfSelectValue } from "../../../flowProject";

type NewFlowDialogProps = {
	scope?: string;
	initialName?: string;
	initialProject?: string;
	projectLocked?: boolean;
	onClose: () => void;
	onCreated: (flow: Flow) => void;
};

// The server makes the slug from the name.
//
// A create with no project gives a flow that applies to every project, which
// is the state this dialog must not reach by accident. So the create waits
// until the project list arrives: with no list the select holds one item,
// and a person cannot tell a project they did not pick from one that failed
// to load.
export function NewFlowDialog({
	scope: callerScope = "",
	onClose,
	onCreated,
	initialName = "",
	initialProject = everyProjectValue,
	projectLocked = false,
}: NewFlowDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState("");
	const [project, setProject] = useState(initialProject);
	const [nameTouched, setNameTouched] = useState(false);
	const projects = useFlowProjects();
	const generation = useRef(0);
	const scope = `${callerScope}:${initialProject}:${projectLocked}`;
	const previousScope = useRef(scope);
	if (previousScope.current !== scope) {
		previousScope.current = scope;
		generation.current++;
	}
	useEffect(
		() => () => {
			generation.current++;
		},
		[],
	);
	const input = FlowCreateInputSchema.safeParse({
		name,
		description,
		project: projectRefOfSelectValue(project) ?? undefined,
	});
	const create = useMutation({
		mutationFn: ({ fields }: { fields: FlowCreateInput; generation: number }) => client.flows.create(fields),
		onSuccess: async (flow, request) => {
			await queryClient.invalidateQueries({ queryKey: orpc.flows.list.key() });
			if (request.generation === generation.current) onCreated(flow);
		},
	});
	const nameError = nameTouched && name.trim() === "" ? "Enter a flow name." : undefined;
	const projectHint = projects.isPending
		? "Loading projects..."
		: "Every project makes the flow available in all projects.";

	return (
		<Dialog open title="New flow" onOpenChange={(open) => !open && !create.isPending && onClose()}>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					setNameTouched(true);
					if (input.success && !create.isPending) create.mutate({ fields: input.data, generation: generation.current });
				}}
			>
				<Input
					label="Name"
					required
					autoFocus
					autoComplete="off"
					disabled={create.isPending}
					error={nameError}
					value={name}
					onBlur={() => setNameTouched(true)}
					onChange={(event) => {
						setName(event.target.value);
						if (create.isError) create.reset();
					}}
				/>
				<Textarea
					label="Description"
					autoComplete="off"
					disabled={create.isPending}
					rows={3}
					value={description}
					onChange={(event) => {
						setDescription(event.target.value);
						if (create.isError) create.reset();
					}}
				/>
				<FlowProjectSelect
					value={project}
					disabled={create.isPending || projectLocked}
					hint={projectHint}
					onChange={(value) => {
						setProject(value);
						if (create.isError) create.reset();
					}}
				/>
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
						disabled={!input.success || projects.data === undefined}
						processing={create.isPending}
					>
						Create flow
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
