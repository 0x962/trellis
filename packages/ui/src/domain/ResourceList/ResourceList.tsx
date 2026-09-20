import { Plus } from "@phosphor-icons/react";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Menu } from "../../primitives/Menu";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Skeleton } from "../../primitives/Skeleton";
import { type ResourceListRow, ResourceRow } from "./components/ResourceRow";

export type ResourceListProps = {
	// The list keeps the order of the caller. It groups nothing.
	rows: readonly ResourceListRow[];
	loading?: boolean;
	// Why the resources did not arrive, in the words of the server.
	error?: string | null;
	onOpen: (id: string) => void;
	onAddDoc: () => void;
	onAddLink: () => void;
	onAddFile: () => void;
};

// The Add control sits in the header, so the row area is the only part of
// the block that changes height.
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
			<SectionHeader
				title="RESOURCES"
				count={loading || error !== null ? undefined : rows.length}
				actions={
					<Menu
						label="Add a resource"
						triggerTooltip="Add a resource"
						trigger={<IconButton label="Add a resource" icon={<Plus />} />}
						items={[
							{ label: "Doc", onSelect: onAddDoc },
							{ label: "Link", onSelect: onAddLink },
							{ label: "File", onSelect: onAddFile },
						]}
					/>
				}
			/>
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
						<ResourceRow key={row.id} row={row} onOpen={onOpen} />
					))}
				</ul>
			)}
		</section>
	);
}
