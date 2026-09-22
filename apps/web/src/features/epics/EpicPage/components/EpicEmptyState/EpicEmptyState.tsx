import { Link } from "@tanstack/react-router";
import { EmptyState } from "@trellis/ui";
import type { ReactNode } from "react";

export type EpicEmptyStateProps = {
	// True when the URL holds a filter.
	filtered: boolean;
	q?: string;
	// The epic route path under `/p/`, which the Clear filters link opens.
	splat: string;
	// The New wave and the Add tickets buttons of the top bar.
	actions: ReactNode;
};

const clearLinkClass =
	"inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-base font-medium text-fg transition duration-hover hover:bg-bg hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

// The Overview of an epic with no ticket in view. With no filter the epic
// holds no ticket and no wave, because a wave with no ticket draws its
// header in the table, so the state offers the same two buttons as the
// top bar.
export function EpicEmptyState({ filtered, q, splat, actions }: EpicEmptyStateProps) {
	if (filtered) {
		return (
			<EmptyState
				variant="page"
				title={q === undefined ? "No tickets match" : `No tickets match '${q}'`}
				description="Clear the filters to see every ticket of the epic."
				action={
					<Link to="/p/$" params={{ _splat: splat }} search={{}} className={clearLinkClass}>
						Clear filters
					</Link>
				}
			/>
		);
	}
	return (
		<EmptyState
			variant="page"
			title="No tickets and no waves"
			description="Add tickets, or create a wave to run tickets in order."
			action={<div className="flex items-center gap-2">{actions}</div>}
		/>
	);
}
