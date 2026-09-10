import { useMutation } from "@tanstack/react-query";
import type { PullRequest, Status, TicketSummary } from "@trellis/api";
import { Button } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";

export type MergedNudgeProps = {
	ticket: TicketSummary;
	pr: PullRequest;
};

// The status a finished ticket lands in: the lowest-position done status of
// the project's own set.
const doneStatus = (statuses: Status[]): Status =>
	statuses.filter((status) => status.category === "done").sort((a, b) => a.position - b.position)[0]!;

// The offer to finish a ticket whose pull request is merged. The person
// decides: nothing moves the ticket until the button is pressed.
export function MergedNudge({ ticket, pr }: MergedNudgeProps) {
	const { client, orpc, queryClient } = useApp();
	const markDone = useMutation({
		mutationFn: async () => {
			const { statuses } = await queryClient.ensureQueryData(
				orpc.statuses.list.queryOptions({ input: { project: ticket.project.id } }),
			);
			return await client.tickets.move({ ticket: ticket.identifier, status: doneStatus(statuses).id });
		},
	});

	if (pr.state !== "merged" || ticket.status.category !== "review") return null;
	return (
		<div data-merged-nudge="" className="flex h-8 items-center gap-3 rounded-md bg-agent-soft px-3 text-sm text-fg">
			<span>PR merged, mark Done?</span>
			<Button size="sm" disabled={markDone.isPending} onClick={() => markDone.mutate()}>
				Mark Done
			</Button>
		</div>
	);
}
