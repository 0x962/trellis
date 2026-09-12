import { useQuery } from "@tanstack/react-query";
import type { ProjectSummary } from "@trellis/api";
import { Button, Dialog, Input } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { useProjectActions } from "../hooks/useProjectActions";

export type DeleteProjectDialogProps = {
	project: Pick<ProjectSummary, "path" | "key" | "name">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const ticketCount = (count: number) => `${formatCount(count)} ${count === 1 ? "ticket" : "tickets"}`;

// A delete of the project and everything under it. The server refuses a
// delete of a project with tickets or sub-projects unless the request sends
// `force`, and a forced delete cannot be undone. So the dialog counts the
// tickets first, and with tickets it waits for the typed project key.
export function DeleteProjectDialog({ project, open, onOpenChange }: DeleteProjectDialogProps) {
	const { orpc } = useApp();
	const { remove } = useProjectActions();
	const [typed, setTyped] = useState("");
	const [pending, setPending] = useState(false);
	const counts = useQuery({ ...orpc.tickets.counts.queryOptions({ input: { project: project.path } }), enabled: open });
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? [];
	const tickets = counts.data?.total;
	const hasSubprojects = projects.some((row) => row.path.startsWith(`${project.path}.`));
	const needsKey = tickets !== undefined && tickets > 0;
	const ready = tickets !== undefined && (!needsKey || typed === project.key) && !pending;

	const close = (next: boolean) => {
		if (!next) setTyped("");
		onOpenChange(next);
	};

	const confirm = async () => {
		setPending(true);
		const deleted = await remove(project, needsKey || hasSubprojects);
		setPending(false);
		if (deleted) close(false);
	};

	const description =
		tickets === undefined
			? "Counting the tickets…"
			: tickets === 0
				? `${project.path} holds no tickets. You cannot undo a delete.`
				: `This deletes ${project.path}, its ${ticketCount(tickets)}, and every sub-project. You cannot undo a delete.`;

	return (
		<Dialog open={open} onOpenChange={close} title={`Delete ${project.name}?`} description={description}>
			{needsKey && (
				<Input
					label={`Type ${project.key} to confirm`}
					value={typed}
					autoFocus
					autoComplete="off"
					spellCheck={false}
					onChange={(event) => setTyped(event.target.value)}
				/>
			)}
			<div className="flex justify-end gap-2">
				<Button onClick={() => close(false)}>Cancel</Button>
				<Button variant="danger" disabled={!ready} onClick={() => void confirm()}>
					Delete project
				</Button>
			</div>
		</Dialog>
	);
}
