import { Link } from "@tanstack/react-router";
import { flowProjectLabel } from "@trellis/api";
import { Badge, EmptyState, EntityCard, FailureState, Skeleton } from "@trellis/ui";
import type { ReactNode } from "react";
import { type FlowDiscoveryEntry, type FlowDiscoveryInput, flowDiscovery } from "../../flowDiscovery";

export type FlowDiscoveryContentProps = {
	input: FlowDiscoveryInput;
	retryAction: ReactNode;
	createAction: ReactNode;
	clearFiltersAction: ReactNode;
};

function PublicationBadge({ entry }: { entry: FlowDiscoveryEntry }) {
	if (entry.document.engine === "legacy") return <Badge>No publication needed</Badge>;
	switch (entry.document.publication.state) {
		case "published":
			return <Badge tone="ok">Published</Badge>;
		case "pending":
			return <Badge tone="wait">Publication pending</Badge>;
		case "failed":
			return <Badge tone="bad">Publication failed</Badge>;
		case "blocked":
			return <Badge tone="bad">Publication blocked</Badge>;
		case "not_requested":
			return <Badge>Not published</Badge>;
	}
}

function CompatibilityBadge({ entry }: { entry: FlowDiscoveryEntry }) {
	switch (entry.compatibility.state) {
		case "needs_migration":
			return <Badge tone="wait">Needs migration</Badge>;
		case "blocked":
			return <Badge tone="bad">Conversion blocked</Badge>;
		case "compatible":
		case "unknown":
			return null;
	}
}

function FlowCardBadges({ entry }: { entry: FlowDiscoveryEntry }) {
	return (
		<>
			<Badge>{flowProjectLabel(entry.document.flow)}</Badge>
			<Badge>{entry.document.engine === "legacy" ? "Legacy" : "Langflow"}</Badge>
			<Badge>Version {entry.document.revision}</Badge>
			<PublicationBadge entry={entry} />
			<CompatibilityBadge entry={entry} />
		</>
	);
}

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
