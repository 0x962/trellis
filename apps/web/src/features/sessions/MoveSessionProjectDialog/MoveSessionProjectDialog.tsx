import { useMutation, useQuery } from "@tanstack/react-query";
import type { Session } from "@trellis/api";
import { Button, Command, Dialog, FailureState } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectItems, selectableProjects } from "../../pickers/ProjectPicker";

const noProject = "__trellis_no_project__";

export type MoveSessionProjectDialogProps = {
	session: Session;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function MoveSessionProjectDialog({ session, open, onOpenChange }: MoveSessionProjectDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const input = useRef<HTMLInputElement>(null);
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
	const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);
	const move = useMutation({
		mutationFn: (project: string | null) => client.sessions.move({ id: session.id, project }),
		onSuccess: () => {
			onOpenChange(false);
		},
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
			]),
	});
	const items = [
		{ id: noProject, label: "No project", current: session.projectId === null },
		...projectItems(selectableProjects(projects.data ?? []), session.projectKey || undefined),
	];
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (move.isPending) return;
				if (!next) {
					move.reset();
					setSelected(null);
				}
				onOpenChange(next);
			}}
			title={`Move ${session.name} to project`}
			initialFocus={input}
		>
			{projects.error && (
				<FailureState
					title="Projects did not load"
					detail={projects.error.message}
					action={
						<Button size="md" processing={projects.isFetching} onClick={() => void projects.refetch()}>
							Retry
						</Button>
					}
				/>
			)}
			{(!projects.error || projects.data) && (
				<div inert={move.isPending} aria-busy={move.isPending}>
					<Command
						inputRef={input}
						label="Search projects"
						placeholder="Move to project"
						items={items}
						onSelect={(id) => {
							if (move.isPending) return;
							setSelected({ id, label: items.find((item) => item.id === id)!.label });
							move.mutate(id === noProject ? null : id);
						}}
						empty={projects.isPending ? "Load projects…" : "No projects."}
					/>
				</div>
			)}
			{move.isPending && (
				<p role="status" className="text-sm text-fg-muted">
					Move to {selected!.label}…
				</p>
			)}
			{move.error && (
				<FailureState
					title="The session did not move"
					description={`Selected project: ${selected!.label}.`}
					detail={move.error.message}
					action={
						<Button size="md" onClick={() => move.mutate(selected!.id === noProject ? null : selected!.id)}>
							Retry move
						</Button>
					}
				/>
			)}
		</Dialog>
	);
}
