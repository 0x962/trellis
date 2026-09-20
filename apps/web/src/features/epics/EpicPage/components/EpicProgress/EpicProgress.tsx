import { Link } from "@tanstack/react-router";
import type { Epic } from "@trellis/api";
import { Badge, StackedBar, StackedBarList } from "@trellis/ui";
import { formatCount } from "../../../../../lib/format";
import type { View } from "../../../../filters/grammar";
import { epicProgress, epicProgressLabel, epicSegments } from "../../../epicBar";
import { epicNext } from "../../../epicNext";
import { epicUrlSearch } from "../../../epicSearch";

export type EpicProgressProps = {
	epic: Epic;
	// The `/p/$` splat of the epic page, which every count link keeps.
	splat: string;
	// The search of the epic page. A count link changes its filters.
	search: Partial<View>;
};

const countLinkClass =
	"inline-flex h-7 items-center rounded-md px-1 text-sm text-fg-muted tabular transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// The header band of the epic page. The first line names the current
// milestone, the first milestone in position order that is not done, with
// its tickets to start, its running tickets, and its tickets that wait for
// the person. A count is a link to the table with the matching filters, and
// plain text when the filter grammar has no matching filter. Then come the
// state, the done tickets over the tickets that count, the bar of the epic
// with its legend, and one bar per milestone in position order. A milestone
// bar has no legend, because the legend of the epic bar names the colors.
export function EpicProgress({ epic, splat, search }: EpicProgressProps) {
	const progress = epicProgress(epic.counts);
	const next = epicNext(epic, search);
	return (
		<section aria-label="Progress" className="flex flex-col gap-3 px-5 pt-4 pb-4 max-md:px-4">
			{next !== null && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span className="text-sm font-medium text-fg">Current: {next.milestone.name}</span>
					{next.counts.map((count) =>
						count.search === null ? (
							<span key={count.key} className="px-1 text-sm text-fg-muted tabular">
								{count.label}
							</span>
						) : (
							<Link
								key={count.key}
								to="/p/$"
								params={{ _splat: splat }}
								search={epicUrlSearch(count.search)}
								className={countLinkClass}
							>
								{count.label}
							</Link>
						),
					)}
				</div>
			)}
			<div className="flex items-center gap-3">
				<Badge tone={epic.state === "done" ? "ok" : "accent"}>{epic.state === "done" ? "Done" : "Open"}</Badge>
				<span className="text-sm text-fg-muted tabular">
					{formatCount(progress.done)} of {formatCount(progress.of)} done
				</span>
			</div>
			<StackedBar label={`Tickets of ${epic.name} by status`} segments={epicSegments(epic.counts)} />
			{epic.milestones.length > 0 && (
				<StackedBarList
					label="Waves"
					rows={epic.milestones.map((milestone) => ({
						key: milestone.id,
						name: milestone.name,
						mark: milestone.id === next?.milestone.id ? <Badge tone="accent">Current</Badge> : undefined,
						barLabel: `${milestone.name}: ${epicProgressLabel(milestone.counts)} done`,
						segments: epicSegments(milestone.counts),
						valueLabel: epicProgressLabel(milestone.counts),
					}))}
				/>
			)}
		</section>
	);
}
