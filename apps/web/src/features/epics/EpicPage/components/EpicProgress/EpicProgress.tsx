import { Link } from "@tanstack/react-router";
import type { Epic } from "@trellis/api";
import { StackedBar } from "@trellis/ui";
import { Fragment, useId, useMemo, useState } from "react";
import { formatCount } from "../../../../../lib/format";
import type { View } from "../../../../filters/grammar";
import type { WorkingTicketIds } from "../../../../table/utils/turnGroups";
import { epicProgress, epicSegments } from "../../../epicBar";
import { epicNext } from "../../../epicNext";
import { epicUrlSearch } from "../../../epicSearch";
import { epicBarLegend } from "./epicBarLegend";

export type EpicProgressProps = {
	epic: Epic;
	// Null until the assigned-run query succeeds.
	running: number | null;
	// The `/p/$` splat of the epic page, which every count link keeps.
	splat: string;
	// The search of the epic page. A count link changes its filters.
	search: Partial<View>;
	// True below 768 px. The legend then hides behind a tap on the bar.
	phone: boolean;
	// Null until the assigned-run query succeeds, as `running` is.
	workingTicketIds: WorkingTicketIds | null;
};

// Below 768 px a count link is 44 px tall, the least a finger hits.
const countLinkClass =
	"inline-flex h-7 max-md:h-11 items-center rounded-md px-1 text-sm text-fg-muted tabular transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// The band and the plan share the top half of the page card
// (`EpicPage.tsx`), and the ticket table takes the rest of it. The band
// stays at four short lines so the table keeps rows on screen. Below
// 768 px it keeps three: the bar and its done count are one button, and a
// tap on it shows or hides the legend.
//
// A count is a link to the table with the matching filters, and plain text
// when the filter grammar has no matching filter.
export function EpicProgress({ epic, running, splat, search, phone, workingTicketIds }: EpicProgressProps) {
	const progress = epicProgress(epic.counts);
	const legendId = useId();
	const [legendOpen, setLegendOpen] = useState(false);
	// `epicNext` reads the turn of every ticket of the current wave, and
	// this component draws again on each keystroke in the filter bar.
	const next = useMemo(
		() => epicNext(epic, running, search, workingTicketIds),
		[epic, running, search, workingTicketIds],
	);
	const bar = (
		<>
			{/* The done count reads in words on the same line, so the bar takes the thin size. */}
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
		</>
	);
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
										search={epicUrlSearch(count.search, phone)}
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
			{phone ? (
				<button
					type="button"
					aria-expanded={legendOpen}
					aria-controls={legendId}
					onClick={() => setLegendOpen((open) => !open)}
					className="-mx-1 flex h-11 items-center gap-3 rounded-md px-1 text-left focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
				>
					{bar}
				</button>
			) : (
				<div className="flex items-center gap-3">{bar}</div>
			)}
			{(!phone || legendOpen) && (
				<p id={legendId} className="text-sm text-fg-faint tabular">
					{epicBarLegend(epic.counts)}
				</p>
			)}
		</section>
	);
}
