import { Plus } from "@phosphor-icons/react";
import { useId } from "react";
import { Button } from "../../primitives/Button";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Menu } from "../../primitives/Menu";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Skeleton } from "../../primitives/Skeleton";
import { type ResourceListRow, ResourceRow } from "./components/ResourceRow";

export type ResourceListProps = {
	// The list keeps the order of the caller. It groups nothing.
	rows: readonly ResourceListRow[];
	// The number in the header. The caller gives it when it knows the count
	// before the rows arrive, which holds the header still. Without it the
	// header counts the rows.
	count?: number;
	loading?: boolean;
	// Why the resources did not arrive, in the words of the server.
	error?: string | null;
	// The rows print while `open` is true.
	open?: boolean;
	// A caller that gives `onToggle` gets a Show or a Hide button in the
	// header, and it holds `open` itself.
	onToggle?: () => void;
	onOpen: (id: string) => void;
	// The three add paths. A caller that leaves them out gets a header with no
	// Add control, and the resources of its epic arrive another way.
	onAddDoc?: () => void;
	onAddLink?: () => void;
	onAddFile?: () => void;
};

// The Add control sits in the header, so the row area is the only part of
// the block that changes height.
export function ResourceList({
	rows,
	count,
	loading = false,
	error = null,
	open = true,
	onToggle,
	onOpen,
	onAddDoc,
	onAddLink,
	onAddFile,
}: ResourceListProps) {
	const bodyId = useId();
	const add =
		onAddDoc !== undefined && onAddLink !== undefined && onAddFile !== undefined
			? { doc: onAddDoc, link: onAddLink, file: onAddFile }
			: null;
	return (
		<section aria-busy={loading} aria-label="Resources" className="flex min-w-0 flex-col gap-1">
			<SectionHeader
				title="Resources"
				count={count ?? (loading || error !== null ? undefined : rows.length)}
				actions={
					<>
						{onToggle !== undefined && (
							<Button
								variant="quiet"
								size="sm"
								aria-expanded={open}
								aria-controls={open ? bodyId : undefined}
								onClick={onToggle}
							>
								{open ? "Hide" : "Show"}
							</Button>
						)}
						{add !== null && (
							<Menu
								label="Add a resource"
								triggerTooltip="Add a resource"
								trigger={<IconButton label="Add a resource" icon={<Plus />} />}
								items={[
									{ label: "Doc", onSelect: add.doc },
									{ label: "Link", onSelect: add.link },
									{ label: "File", onSelect: add.file },
								]}
							/>
						)}
					</>
				}
			/>
			{open && (
				<div id={bodyId} className="flex min-w-0 flex-col">
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
				</div>
			)}
		</section>
	);
}
