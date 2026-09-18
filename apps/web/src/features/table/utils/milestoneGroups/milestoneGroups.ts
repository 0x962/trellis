import type { MilestoneSummary } from "@trellis/api";
import { formatCount } from "../../../../lib/format";

// What the header of one milestone group prints beside its label.
export type MilestoneMark = {
	// The done tickets over the tickets that count, `3/11`. A canceled ticket
	// is never in the total.
	countLabel: string;
	// "Current" on the current milestone of the epic.
	badge?: string;
	// "Later" on an open milestone after the current one. Order lives between
	// milestones, so its tickets wait for the current milestone.
	note?: string;
};

// The marks of the milestones of one epic, by milestone id. `milestones` is
// in position order. `currentId` is the id of `EpicSummary.currentMilestone`:
// the first milestone that is not done, or undefined when every milestone is
// done.
export const milestoneMarks = (
	milestones: readonly MilestoneSummary[],
	currentId: string | undefined,
): Map<string, MilestoneMark> => {
	const currentIndex = milestones.findIndex((milestone) => milestone.id === currentId);
	return new Map(
		milestones.map((milestone, index) => {
			const { counts } = milestone;
			const mark: MilestoneMark = {
				countLabel: `${formatCount(counts.done)}/${formatCount(counts.total - counts.canceled)}`,
			};
			if (index === currentIndex) mark.badge = "Current";
			else if (currentIndex !== -1 && index > currentIndex && milestone.state === "open") mark.note = "Later";
			return [milestone.id, mark];
		}),
	);
};

// The group keys of the done milestones. A table of one epic collapses them
// until the first toggle on its route. A milestone group has the milestone
// id as its key.
export const doneMilestoneIds = (milestones: readonly MilestoneSummary[]): string[] =>
	milestones.filter((milestone) => milestone.state === "done").map((milestone) => milestone.id);
