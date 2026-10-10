import { useMutation, useQuery } from "@tanstack/react-query";
import type { Project, ProjectCreateInput } from "@trellis/api";
import { Button, Dialog, FailureState } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { useApp } from "../../../lib/appContext";
import { takenColors } from "../../../lib/projectColors";
import { ProjectStep } from "../../setup/ProjectStep";

export type CreateProjectDialogProps = {
	initialName: string;
	scope?: string;
	onCreated: (project: Project) => void;
	onClose: () => void;
};

export function CreateProjectDialog({ initialName, scope, onCreated, onClose }: CreateProjectDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const generation = useRef(0);
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
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
	const create = useMutation({
		mutationFn: ({ input }: { input: ProjectCreateInput; generation: number }) => client.projects.create(input),
		onSuccess: async (project, attempt) => {
			await queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
			if (attempt.generation === generation.current) onCreated(project);
		},
	});
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !create.isPending) onClose();
			}}
			title="Create project"
			bare
			className="gap-4 p-4"
		>
			{projects.error ? (
				<FailureState
					title="Projects did not load"
					detail={projects.error.message}
					action={<Button onClick={() => void projects.refetch()}>Retry</Button>}
				/>
			) : projects.data ? (
				<ProjectStep
					initialName={initialName}
					taken={projects.data.map((project) => project.key)}
					takenNames={projects.data.map((project) => project.name)}
					takenColors={takenColors(projects.data)}
					onCreate={async (input) => {
						await create.mutateAsync({ input, generation: generation.current });
					}}
					onCancel={onClose}
				/>
			) : (
				<p role="status" className="text-sm text-fg-muted">
					Load projects…
				</p>
			)}
		</Dialog>
	);
}
