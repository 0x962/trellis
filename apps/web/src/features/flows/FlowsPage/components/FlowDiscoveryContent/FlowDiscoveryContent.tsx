import { Link } from "@tanstack/react-router";
import { EmptyState, EntityCard, FailureState, Skeleton } from "@trellis/ui";
import type { ReactNode } from "react";
import { type FlowDiscoveryInput, flowDiscovery } from "../../flowDiscovery";
import { FlowCardBadges } from "./components/FlowCardBadges";

export type FlowDiscoveryContentProps = {
	input: FlowDiscoveryInput;
	retryAction: ReactNode;
	createAction: ReactNode;
	clearFiltersAction: ReactNode;
};

export function FlowDiscoveryContent({
	input,
	retryAction,
	createAction,
	clearFiltersAction,
}: FlowDiscoveryContentProps) {
	const view = flowDiscovery(input);
	return (
		<div className="flex flex-col gap-4">
			{view.engine.state === "unknown" && (
				<p role="status" className="text-sm text-fg-muted">
					{view.engine.reason}
				</p>
			)}
			{view.engine.state === "unavailable" && (
				<FailureState title="Flow engine unavailable" description={view.engine.reason} />
			)}
			{view.state === "loading" ? (
				<div role="status" aria-label="Load flows" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-24 w-full" />
				</div>
			) : view.state === "failed" ? (
				<FailureState title="Could not load flows" detail={view.message} action={retryAction} />
			) : view.state === "empty" ? (
				<EmptyState
					title="No flows yet"
					description="Create a flow to define a repeatable process."
					action={createAction}
				/>
			) : view.state === "no_matches" ? (
				<EmptyState
					title="No matching flows"
					description={`No flows match “${view.filters.query}” in ${view.filters.project ?? "All projects"}.`}
					action={clearFiltersAction}
				/>
			) : (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					{view.entries.map((entry) => (
						<EntityCard
							key={entry.document.flow.id}
							title={entry.document.flow.name}
							description={entry.document.flow.description || "No description."}
							link={<Link to="/ai/flows/$slug" params={{ slug: entry.document.flow.slug }} />}
							badges={<FlowCardBadges entry={entry} />}
						/>
					))}
				</div>
			)}
		</div>
	);
}
