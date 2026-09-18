import { Button, SectionHeader } from "@trellis/ui";
import { useId } from "react";
import { ReadOnlyMarkdown } from "../../../../../components/ReadOnlyMarkdown";
import { useCollapsedGroups } from "../../../../table/hooks/useCollapsedGroups";

export type EpicPlanProps = {
	// The pathname of the epic page, which keys the stored collapse state.
	routeKey: string;
	// The description of the epic, as markdown.
	description: string;
};

// A description above this length starts collapsed, so a long plan does
// not push the ticket table off the screen.
export const planCollapseLength = 1200;

const planKey = "plan";
const collapsedPlan: readonly string[] = [planKey];
const expandedPlan: readonly string[] = [];

// The "Plan" section of the epic page: the description of the epic through
// the ticket markdown renderer, under a header that collapses it. The
// collapse state lives in `uiStore` under `<routeKey>#plan`. The ticket
// table stores its collapsed groups under `routeKey` with its own defaults,
// and the first toggle under a key writes the whole list of that key, so
// the plan takes a key of its own. The band and the plan scroll inside one
// area of the epic page that is at most half of the page card. The header
// sticks to the top of that area on the ground of the page, so a plan that
// the area cuts reads as a scrolled list, and Hide stays in reach at every
// scroll position.
export function EpicPlan({ routeKey, description }: EpicPlanProps) {
	const bodyId = useId();
	const { isCollapsed, toggle } = useCollapsedGroups(
		`${routeKey}#plan`,
		description.length > planCollapseLength ? collapsedPlan : expandedPlan,
	);
	const expanded = !isCollapsed(planKey);
	return (
		<section aria-label="Plan" className="flex flex-col gap-2 px-5 pb-4 max-md:px-4">
			<SectionHeader
				title="Plan"
				className="sticky top-0 z-10 bg-pane"
				actions={
					<Button
						variant="quiet"
						size="sm"
						aria-expanded={expanded}
						aria-controls={expanded ? bodyId : undefined}
						onClick={() => toggle(planKey)}
					>
						{expanded ? "Hide" : "Show"}
					</Button>
				}
			/>
			{expanded &&
				(description.trim() === "" ? (
					<p id={bodyId} className="text-sm text-fg-faint">
						No description. Edit the epic to write the plan.
					</p>
				) : (
					<div id={bodyId}>
						<ReadOnlyMarkdown markdown={description} className="text-md" />
					</div>
				))}
		</section>
	);
}
