import type { Epic } from "@trellis/api";
import { Badge, StackedBar } from "@trellis/ui";
import { formatCount } from "../../../../../lib/format";
import { epicProgress, epicProgressLabel, epicSegments } from "../../../epicBar";

export type EpicProgressProps = {
	epic: Epic;
};

// The header band of the epic page: the state, the done tickets over the
// tickets that count, the bar of the epic with its legend, and one bar per
// milestone in position order. A milestone bar has no legend, because the
// legend of the epic bar names the colors.
export function EpicProgress({ epic }: EpicProgressProps) {
	const progress = epicProgress(epic.counts);
	return (
		<section aria-label="Progress" className="flex flex-col gap-3 px-5 pt-4 pb-4 max-md:px-4">
			<div className="flex items-center gap-3">
				<Badge tone={epic.state === "done" ? "ok" : "accent"}>{epic.state === "done" ? "Done" : "Open"}</Badge>
				<span className="text-sm text-fg-muted tabular">
					{formatCount(progress.done)} of {formatCount(progress.of)} done
				</span>
			</div>
			<StackedBar label={`Tickets of ${epic.name} by status`} segments={epicSegments(epic.counts)} />
			{epic.milestones.length > 0 && (
				<ul aria-label="Milestones" className="flex flex-col gap-2">
					{epic.milestones.map((milestone) => (
						<li
							key={milestone.id}
							className="grid grid-cols-[minmax(0,240px)_minmax(0,1fr)_48px] items-center gap-3 max-md:grid-cols-[minmax(0,1fr)_96px_48px] max-md:gap-2"
						>
							<span title={milestone.name} className="truncate text-sm text-fg">
								{milestone.name}
							</span>
							<StackedBar
								label={`${milestone.name}: ${epicProgressLabel(milestone.counts)} done`}
								segments={epicSegments(milestone.counts)}
								legend={false}
							/>
							<span className="text-sm text-fg-muted tabular">{epicProgressLabel(milestone.counts)}</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
