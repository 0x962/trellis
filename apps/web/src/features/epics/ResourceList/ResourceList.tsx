import type { Resource } from "@trellis/api";
import { type ResourceListRow, ResourceList as ResourceListView } from "@trellis/ui";
import { useMemo } from "react";
import { resourceDetail } from "./resourceDetail";

export type ResourceListProps = {
	// The resources of the epic, in the order the server returns them.
	resources: readonly Resource[];
	count?: number;
	loading?: boolean;
	error?: string | null;
	expanded?: boolean;
	onToggle?: () => void;
	headerClassName?: string;
	onOpen: (id: string) => void;
	onAdd?: {
		doc: () => void;
		link: () => void;
		file: () => void;
	};
};

export function ResourceList({
	resources,
	count,
	loading,
	error,
	expanded,
	onToggle,
	headerClassName,
	onOpen,
	onAdd,
}: ResourceListProps) {
	const rows = useMemo<ResourceListRow[]>(
		() =>
			resources.map((resource) => ({
				id: resource.id,
				kind: resource.kind,
				name: resource.name,
				detail: resourceDetail(resource),
				pullRequest: resource.pullRequestNumber,
			})),
		[resources],
	);
	return (
		<ResourceListView
			rows={rows}
			count={count}
			loading={loading}
			error={error}
			expanded={expanded}
			onToggle={onToggle}
			headerClassName={headerClassName}
			onOpen={onOpen}
			onAdd={onAdd}
		/>
	);
}
