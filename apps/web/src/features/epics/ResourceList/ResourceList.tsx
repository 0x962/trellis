import type { Resource } from "@trellis/api";
import { ResourceList as ResourceListView, type ResourceRowValue } from "@trellis/ui";
import { useMemo } from "react";
import { resourceDetail } from "./resourceDetail";

export type ResourceListProps = {
	// The resources of the epic, in the order the server returns them.
	resources: readonly Resource[];
	loading?: boolean;
	error?: string | null;
	onOpen: (id: string) => void;
	onAddDoc: () => void;
	onAddLink: () => void;
	onAddFile: () => void;
};

// This wrapper turns each resource record into the three words the row
// prints: the kind, the name and the detail line.
export function ResourceList({ resources, loading, error, onOpen, onAddDoc, onAddLink, onAddFile }: ResourceListProps) {
	const rows = useMemo<ResourceRowValue[]>(
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
			loading={loading}
			error={error}
			onOpen={onOpen}
			onAddDoc={onAddDoc}
			onAddLink={onAddLink}
			onAddFile={onAddFile}
		/>
	);
}
