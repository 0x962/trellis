import { useQuery } from "@tanstack/react-query";
import type { ProjectSummary } from "@trellis/api";
import { Button, Dialog, FailureState, Input } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useProjectActions } from "../hooks/useProjectActions";
import { deleteProjectReadOptions, deleteProjectState } from "./deleteProjectState";

export type DeleteProjectDialogProps = {
	project: Pick<ProjectSummary, "key" | "name">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function DeleteProjectDialog({ project, open, onOpenChange }: DeleteProjectDialogProps) {
	const { orpc } = useApp();
	const { remove } = useProjectActions();
	const [typed, setTyped] = useState("");
	const [pending, setPending] = useState(false);
	const deleting = useRef(false);
	const counts = useQuery({
		...orpc.tickets.counts.queryOptions({ input: { project: project.key } }),
		...deleteProjectReadOptions,
		enabled: open,
	});
	const flowQuery = useQuery({
		...orpc.flows.list.queryOptions({ input: { project: project.key } }),
		...deleteProjectReadOptions,
		enabled: open,
	});
	const loading = counts.isFetching || flowQuery.isFetching;
	const failed = counts.error !== null || flowQuery.error !== null;
	const state = deleteProjectState({
		projectKey: project.key,
		ticketCount: counts.data?.total,
		flowCount: flowQuery.data?.filter((flow) => flow.project === project.key).length,
		typedKey: typed,
		loading,
		failed,
		pending,
	});

	const close = (next: boolean) => {
		if (deleting.current || pending) return;
		if (!next) setTyped("");
		onOpenChange(next);
	};

	const confirm = async () => {
		if (deleting.current || !state.loaded) return;
		deleting.current = true;
		setPending(true);
		const deleted = await remove(project, state.needsKey);
		deleting.current = false;
		setPending(false);
		if (deleted) {
			setTyped("");
			onOpenChange(false);
		}
	};

	const retry = () => void Promise.all([counts.refetch(), flowQuery.refetch()]);
	const failureDetail = counts.error?.message ?? flowQuery.error?.message;

	return (
		<Dialog open={open} onOpenChange={close} title={`Delete ${project.name}?`} description={state.description}>
			{failed && (
				<FailureState
					variant="section"
					title="The project contents did not load."
					description="Retry before you delete this project."
					detail={failureDetail}
					action={
						<Button size="md" processing={loading} onClick={retry}>
							Retry
						</Button>
					}
				/>
			)}
			{state.needsKey && (
				<Input
					label={`Type ${project.key} to confirm`}
					value={typed}
					autoFocus
					disabled={pending}
					autoComplete="off"
					spellCheck={false}
					onChange={(event) => setTyped(event.target.value)}
				/>
			)}
			<div className="flex justify-end gap-2">
				<Button disabled={pending} onClick={() => close(false)}>
					Cancel
				</Button>
				<Button variant="danger" disabled={!state.ready} processing={pending} onClick={() => void confirm()}>
					Delete project
				</Button>
			</div>
		</Dialog>
	);
}
