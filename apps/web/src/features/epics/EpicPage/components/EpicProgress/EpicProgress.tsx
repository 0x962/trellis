import { Link } from "@tanstack/react-router";
import type { Epic } from "@trellis/api";
import { StackedBar } from "@trellis/ui";
import { Fragment } from "react";
import { formatCount } from "../../../../../lib/format";
import type { View } from "../../../../filters/grammar";
import { epicProgress, epicSegments } from "../../../epicBar";
import { epicNext } from "../../../epicNext";
import { epicUrlSearch } from "../../../epicSearch";
import { bandLegend } from "./bandLegend";

export type EpicProgressProps = {
	epic: Epic;
	// The `/p/$` splat of the epic page, which every count link keeps.
	splat: string;
	// The search of the epic page. A count link changes its filters.
	search: Partial<View>;
};

const countLinkClass =
	"inline-flex h-7 items-center rounded-md px-1 text-sm text-fg-muted tabular transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// The header band of the epic page, in four lines. Line 1 names the current
// wave, the first wave in position order that is not done. Line 2 prints its
// tickets to start, its running tickets and its tickets that wait for the
// person; a count is a link to the table with the matching filters, and
// plain text when the filter grammar has no matching filter. Line 3 draws
// one 6 px bar of the whole epic and the done tickets over the tickets that
// count. Line 4 prints the word legend of the bar.
//
// The band draws no bar per wave. The band and the plan share the top half
// of the page card (`EpicPage.tsx`), and the table below it must keep rows
// on screen.
export function EpicProgress({ epic, splat, search }: EpicProgressProps) {
	const progress = epicProgress(epic.counts);
	const next = epicNext(epic, search);
	return (
		<section aria-label="Progress" className="flex flex-col gap-2 px-5 pt-4 pb-4 max-md:px-4">
			{next !== null && (
				<>
					<p className="text-sm text-fg-muted">
						Current: <span className="font-medium text-fg">{next.milestone.name}</span>
					</p>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						{next.counts.map((count, index) => (
							<Fragment key={count.key}>
								{index > 0 && (
									<span aria-hidden="true" className="text-sm text-fg-faint">
										·
									</span>
								)}
								{count.search === null ? (
									<span className="px-1 text-sm text-fg-muted tabular">{count.label}</span>
								) : (
									<Link
										to="/p/$"
										params={{ _splat: splat }}
										search={epicUrlSearch(count.search)}
										className={countLinkClass}
									>
										{count.label}
									</Link>
								)}
							</Fragment>
						))}
					</div>
				</>
			)}
			<div className="flex items-center gap-3">
				<StackedBar
					label={`Tickets of ${epic.name} by status`}
					segments={epicSegments(epic.counts)}
					size="sm"
					legend={false}
					className="flex-1"
				/>
				<span className="shrink-0 text-sm text-fg-muted tabular">
					{formatCount(progress.done)} of {formatCount(progress.of)} done
				</span>
			</div>
			<p className="text-sm text-fg-faint tabular">{bandLegend(epic.counts)}</p>
		</section>
	);
}
