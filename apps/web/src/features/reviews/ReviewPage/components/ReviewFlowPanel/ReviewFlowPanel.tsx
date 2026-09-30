import { EmptyState } from "@trellis/ui";
import { FlowRuns } from "../../../FlowRuns";

export function ReviewFlowPanel({ target }: { target: { ticket: string; headSha: string; diffId: string } | null }) {
	return (
		<div className="review-blocks">
			{target === null ? (
				<EmptyState
					title="No flow runs"
					description="No ticket links this pull request, and a flow runs against a ticket."
				/>
			) : (
				<FlowRuns ticket={target.ticket} headSha={target.headSha} diffId={target.diffId} />
			)}
		</div>
	);
}
