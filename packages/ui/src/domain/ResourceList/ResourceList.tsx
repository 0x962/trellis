import { Plus } from "@phosphor-icons/react";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Skeleton } from "../../primitives/Skeleton";
import { Tooltip } from "../../primitives/Tooltip";
import { type ResourceKind, type ResourceListRow, ResourceRow } from "./components/ResourceRow";

export type ResourceListProps = {
	// The rows of one kind keep the order of the caller.
	rows: readonly ResourceListRow[];
	loading?: boolean;
	// Why the resources did not arrive, in the words of the server.
	error?: string | null;
	onOpen: (id: string) => void;
	// The id of the row whose document is open beside the list.
	selectedId?: string | null;
	// A caller that gives `onNewDocument` gets a New document button beside
	// the Documents heading.
	onNewDocument?: () => void;
	newDocumentPending?: boolean;
};

const groups: readonly { kind: ResourceKind; title: string }[] = [
	{ kind: "doc", title: "Documents" },
	{ kind: "link", title: "Links" },
	{ kind: "image", title: "Images" },
	{ kind: "file", title: "Files" },
];

// The resources of an epic, grouped by kind under the section headings of the
// app sidebar. The Documents heading always shows, because it holds the New
// document button. A kind with no row shows no heading.
export function ResourceList({
	rows,
	loading = false,
	error = null,
	onOpen,
	selectedId = null,
	onNewDocument,
	newDocumentPending = false,
}: ResourceListProps) {
	const body =
		error !== null ? (
			<p role="alert" className="px-2 py-1 text-sm text-danger">
				{error}
			</p>
		) : loading ? (
			<Skeleton className="px-2 py-2" height="h-4" lines={3} />
		) : rows.length === 0 ? (
			<EmptyState description="The epic holds no resource." />
		) : null;
	return (
		<nav aria-busy={loading} aria-label="Resources" className="flex min-w-0 flex-col">
			{groups.map(({ kind, title }) => {
				const members = rows.filter((row) => row.kind === kind);
				if (kind !== "doc" && members.length === 0) return null;
				return (
					<section key={kind} aria-label={title} className="flex min-w-0 flex-col not-first:mt-3">
						<div className="sidebar-section">
							<h3>{title}</h3>
							{kind === "doc" && onNewDocument !== undefined && (
								<Tooltip content="New document">
									<IconButton
										size="xs"
										className="pointer-coarse:size-11 pointer-coarse:before:inset-0"
										label="New document"
										icon={<Plus />}
										disabled={newDocumentPending}
										onClick={onNewDocument}
									/>
								</Tooltip>
							)}
						</div>
						{members.length > 0 && (
							<ul className="flex min-w-0 flex-col gap-px">
								{members.map((row) => (
									<ResourceRow key={row.id} row={row} onOpen={onOpen} selected={row.id === selectedId} />
								))}
							</ul>
						)}
						{kind === "doc" && body}
					</section>
				);
			})}
		</nav>
	);
}
