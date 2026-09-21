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
	// The number in the header before the rows arrive. A caller that knows the
	// number ahead of the rows holds the header still with it. The header
	// counts the rows as soon as it has them.
	count?: number;
	loading?: boolean;
	// Why the resources did not arrive, in the words of the server.
	error?: string | null;
	expanded?: boolean;
	// A caller that gives `onToggle` gets a Show or a Hide button in the
	// header, and it holds `expanded` itself.
	onToggle?: () => void;
	// Classes for the header row, such as the sticky position of a section
	// that scrolls inside a fixed area.
	headerClassName?: string;
	onOpen: (id: string) => void;
	// The three paths that add a resource. A caller that leaves them out gets
	// a header with no Add control.
	onAdd?: {
		doc: () => void;
		link: () => void;
		file: () => void;
	};
};

// The Add control sits in the header, so the row area is the only part of
// the block that changes height.
export function ResourceList({
	rows,
	count,
	loading = false,
	error = null,
	expanded = true,
	onToggle,
	headerClassName,
	onOpen,
	onAdd,
}: ResourceListProps) {
	const bodyId = useId();
	// A shut list and a loading list keep the number of the caller. An open
	// list counts its own rows, because the caller reads the number and the
	// rows in two requests, and the rows are the newer answer.
	const shown = expanded ? (loading ? count : error !== null ? undefined : rows.length) : count;
	return (
		<section aria-busy={loading} aria-label="Resources" className="flex min-w-0 flex-col gap-2">
			<SectionHeader
				title="Resources"
				count={shown}
				className={headerClassName}
				actions={
					<>
						{onToggle !== undefined && (
							<Button
								variant="quiet"
								size="sm"
								aria-expanded={expanded}
								aria-controls={expanded ? bodyId : undefined}
								onClick={onToggle}
							>
								{expanded ? "Hide" : "Show"}
							</Button>
						)}
						{onAdd !== undefined && (
							<Menu
								label="Add a resource"
								triggerTooltip="Add a resource"
								trigger={<IconButton label="Add a resource" icon={<Plus />} />}
								items={[
									{ label: "Doc", onSelect: onAdd.doc },
									{ label: "Link", onSelect: onAdd.link },
									{ label: "File", onSelect: onAdd.file },
								]}
							/>
						)}
					</>
				}
			/>
			{expanded && (
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
