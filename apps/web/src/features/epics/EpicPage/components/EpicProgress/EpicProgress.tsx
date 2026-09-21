import { Link } from "@tanstack/react-router";
import type { Epic } from "@trellis/api";
import { Fragment, useMemo } from "react";
import type { View } from "../../../../filters/grammar";
import type { WorkingTicketIds } from "../../../../table/utils/turnGroups";
import { epicNext } from "../../../epicNext";
import { epicUrlSearch } from "../../../epicSearch";

export type EpicProgressProps = {
	epic: Epic;
	// Null until the assigned-run query succeeds.
	running: number | null;
	// The `/p/$` splat of the epic page, which every count link keeps.
	splat: string;
	// The search of the epic page. A count link changes its filters.
	search: Partial<View>;
	// True below 768 px. `epicUrlSearch` then removes the default turn group
	// from each link.
	phone: boolean;
	// Null until the assigned-run query succeeds, as `running` is.
	workingTicketIds: WorkingTicketIds | null;
	// After a count link changes the table filters, this callback closes its
	// `PageSheet`.
	onCountClick?: () => void;
};

// On a phone and on a touch screen a count link is 44 px tall. 44 px is the
// smallest touch target.
const countLinkClass =
	"inline-flex h-7 max-md:h-11 pointer-coarse:h-11 items-center rounded-md px-1 text-sm text-fg-muted tabular transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// A count is a link to the table with the matching filters, and plain text
// when the filter grammar has no matching filter.
export function EpicProgress({
	epic,
	running,
	splat,
	search,
	phone,
	workingTicketIds,
	onCountClick,
}: EpicProgressProps) {
	// `epicNext` reads the turn of every ticket of the current wave, and
	// this component draws again on each keystroke in the filter bar.
	const next = useMemo(
		() => epicNext(epic, running, search, workingTicketIds),
		[epic, running, search, workingTicketIds],
	);
	if (next === null) return null;
	return (
		<section aria-label="Current work" className="px-5 py-2 max-md:px-4">
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<span className="text-sm text-fg-muted">
					Current: <span className="font-medium text-fg">{next.wave.name}</span>
				</span>
				<span aria-hidden="true" className="text-sm text-fg-faint">
					·
				</span>
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
								onClick={onCountClick}
							>
								{count.label}
							</Link>
						)}
					</Fragment>
				))}
			</div>
		</section>
	);
}
