import { useQuery } from "@tanstack/react-query";
import type { ProjectSummary } from "@trellis/api";
import { Button, Dialog, Input } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { useProjectActions } from "../hooks/useProjectActions";

export type DeleteProjectDialogProps = {
	project: Pick<ProjectSummary, "key" | "name">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const ticketCount = (count: number) => `${formatCount(count)} ${count === 1 ? "ticket" : "tickets"}`;

const flowCount = (count: number) => `${formatCount(count)} ${count === 1 ? "flow" : "flows"}`;

// A delete of the project, every ticket in it and every flow of it. The
// server refuses a delete of a project with tickets or flows unless the
// request sends `force`, and a forced delete cannot be undone. So the dialog
// counts the tickets first, and with tickets it waits for the typed project
// key. The description names the flows: a flow holds a briefing and a graph
// that nothing else keeps.
export function DeleteProjectDialog({ project, open, onOpenChange }: DeleteProjectDialogProps) {
	const { orpc } = useApp();
	const { remove } = useProjectActions();
	const [typed, setTyped] = useState("");
	const [pending, setPending] = useState(false);
	const counts = useQuery({ ...orpc.tickets.counts.queryOptions({ input: { project: project.key } }), enabled: open });
	const flows = useQuery({ ...orpc.flows.list.queryOptions({ input: {} }), enabled: open }).data ?? [];
	const tickets = counts.data?.total;
	const ownFlows = flows.filter((flow) => flow.project === project.key).length;
	const needsKey = tickets !== undefined && tickets > 0;
	const ready = tickets !== undefined && (!needsKey || typed === project.key) && !pending;

	const close = (next: boolean) => {
		if (!next) setTyped("");
		onOpenChange(next);
	};

	const confirm = async () => {
		setPending(true);
		const deleted = await remove(project, needsKey || ownFlows > 0);
		setPending(false);
		if (deleted) close(false);
	};

	const flowLine = ownFlows === 0 ? "" : ` It also deletes ${flowCount(ownFlows)} with every step.`;
	const description =
		tickets === undefined
			? "Counting the tickets…"
			: tickets === 0
				? `${project.key} holds no tickets. You cannot undo a delete.${flowLine}`
				: `This deletes ${project.key} and its ${ticketCount(tickets)}. You cannot undo a delete.${flowLine}`;

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
