import type { Resource } from "@trellis/api";
import { type ResourceListRow, ResourceList as ResourceListView } from "@trellis/ui";
import { useMemo } from "react";
import { resourceDetail } from "./resourceDetail";

export type ResourceListProps = {
	// The resources of the epic, in the order the server returns them.
	resources: readonly Resource[];
	// The number in the header while the rows are on their way.
	count?: number;
	loading?: boolean;
	error?: string | null;
	// The rows print while `open` is true, and `onToggle` puts a Show or a
	// Hide button in the header.
	open?: boolean;
	onToggle?: () => void;
	onOpen: (id: string) => void;
	// The three add paths. A caller that leaves them out gets a header with no
	// Add control.
	onAddDoc?: () => void;
	onAddLink?: () => void;
	onAddFile?: () => void;
};

export function ResourceList({
	resources,
	count,
	loading,
	error,
	open,
	onToggle,
	onOpen,
	onAddDoc,
	onAddLink,
	onAddFile,
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
			open={open}
			onToggle={onToggle}
			onOpen={onOpen}
			onAddDoc={onAddDoc}
			onAddLink={onAddLink}
			onAddFile={onAddFile}
		/>
	);
}
