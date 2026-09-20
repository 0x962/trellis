import { Button } from "../../primitives/Button";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Skeleton } from "../../primitives/Skeleton";
import { ResourceRow, type ResourceRowValue } from "./components/ResourceRow";

export type ResourceListProps = {
	// Every resource of the epic, in the order the caller gives. The list
	// keeps that order and groups nothing.
	rows: readonly ResourceRowValue[];
	// True while the request for the resources is not complete.
	loading?: boolean;
	// Why the resources did not arrive, in the words of the server. Null
	// means they arrived.
	error?: string | null;
	onOpen: (id: string) => void;
	onAddDoc: () => void;
	onAddLink: () => void;
	onAddFile: () => void;
};

// The resources of an epic: docs, links, images and files in one list. The
// three controls stay under every state, so the row area is the only part
// of the block that changes height.
export function ResourceList({
	rows,
	loading = false,
	error = null,
	onOpen,
	onAddDoc,
	onAddLink,
	onAddFile,
}: ResourceListProps) {
	return (
		<section aria-busy={loading} aria-label="Resources" className="flex min-w-0 flex-col gap-1">
			<SectionHeader title="RESOURCES" count={loading || error !== null ? undefined : rows.length} />
			{error !== null ? (
				<p role="alert" className="py-2 text-sm text-danger">
					{error}
				</p>
			) : loading ? (
				<Skeleton className="py-2" height="h-4" lines={3} />
			) : rows.length === 0 ? (
				<EmptyState description="The epic holds no resource." />
			) : (
				<ul className="flex min-w-0 flex-col">
					{rows.map((row) => (
						<ResourceRow key={row.id} value={row} onOpen={onOpen} />
					))}
				</ul>
			)}
			<div className="flex items-center justify-end gap-2 pt-1">
				<Button onClick={onAddDoc}>Add doc</Button>
				<Button onClick={onAddLink}>Add link</Button>
				<Button onClick={onAddFile}>Add file</Button>
			</div>
		</section>
	);
}
