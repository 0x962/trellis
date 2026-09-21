import { useMutation, useQuery } from "@tanstack/react-query";
import type { Session } from "@trellis/api";
import { Command, Dialog } from "@trellis/ui";
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
	const [error, setError] = useState<string | null>(null);
	const move = useMutation({
		mutationFn: (project: string | null) => client.sessions.move({ id: session.id, project }),
		onSuccess: () => {
			onOpenChange(false);
			setError(null);
		},
		onError: (failure) => setError(failure instanceof Error ? failure.message : String(failure)),
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
			]),
	});
	const items = [
		{ id: noProject, label: "No project", current: session.projectId === null },
		...projectItems(selectableProjects(projects.data ?? []), session.projectPath || undefined),
	];
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) setError(null);
				onOpenChange(next);
			}}
			title={`Move ${session.name} to project`}
			initialFocus={input}
		>
			<Command
				inputRef={input}
				label="Search projects"
				placeholder="Move to project"
				items={items}
				onSelect={(id) => move.mutate(id === noProject ? null : id)}
				empty={projects.isPending ? "Load projects…" : "No projects."}
			/>
			{error !== null && (
				<p role="alert" className="mt-2 rounded-sm bg-danger-soft px-2 py-1.5 text-sm text-danger">
					{error}
				</p>
			)}
		</Dialog>
	);
}
