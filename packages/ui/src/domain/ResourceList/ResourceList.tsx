import { Plus } from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Button } from "../../primitives/Button";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Skeleton } from "../../primitives/Skeleton";
import { Tooltip } from "../../primitives/Tooltip";
import type { LinkPress } from "../../utils/linkPress";
import { FailureState } from "../FailureState";
import { GroupHeader } from "../GroupHeader";
import { type ResourceKind, type ResourceListRow, ResourceRow } from "./components/ResourceRow";

export type ResourceListProps = {
	// The rows of one kind keep the order of the caller.
	rows: readonly ResourceListRow[];
	loading?: boolean;
	// Why the resources did not arrive, in the words of the server.
	error?: string | null;
	onRetry?: () => void;
	openError?: string | null;
	onRetryOpen?: () => void;
	onOpen: (id: string, press: LinkPress) => void;
	// The id of the row whose document is open beside the list.
	selectedId?: string | null;
	// A caller that gives `onNewDocument` gets a New document button beside
	// the Documents heading.
	onNewDocument?: () => void;
	newDocumentPending?: boolean;
	newDocumentError?: string | null;
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
	onRetry,
	openError = null,
	onRetryOpen,
	onOpen,
	selectedId = null,
	onNewDocument,
	newDocumentPending = false,
	newDocumentError = null,
}: ResourceListProps) {
	const id = useId();
	const phone = useMediaQuery("(pointer: coarse)");
	const [expandedKind, setExpandedKind] = useState<ResourceKind | null>("doc");
	const recovery =
		error !== null
			? { title: "The resources do not load.", action: onRetry, label: "Retry" }
			: openError !== null
				? { title: "The resource does not load.", action: onRetryOpen, label: "Retry" }
				: newDocumentError !== null
					? { title: "The document is not created.", action: onNewDocument, label: "Try again" }
					: null;
	const groupedRows = useMemo(() => {
		const members: Record<ResourceKind, ResourceListRow[]> = { doc: [], link: [], image: [], file: [] };
		for (const row of rows) members[row.kind].push(row);
		return groups.map((group) => ({ ...group, rows: members[group.kind] }));
	}, [rows]);
	const body =
		error !== null ? (
			<FailureState
				title="The resources do not load."
				detail={error}
				action={
					onRetry && (
						<Button size="md" onClick={onRetry}>
							Retry
						</Button>
					)
				}
			/>
		) : loading ? (
			<Skeleton className="px-2 py-2" height="h-4" lines={3} />
		) : rows.length === 0 ? (
			<EmptyState description="The epic holds no resource." />
		) : null;
	return (
		<nav aria-busy={loading} aria-label="Resources" className="flex min-h-0 min-w-0 flex-1 flex-col">
			{expandedKind !== "doc" && recovery !== null && (
				<FailureState
					variant="inline"
					className="shrink-0"
					title={recovery.title}
					action={
						recovery.action && (
							<Button size="md" onClick={recovery.action}>
								{recovery.label}
							</Button>
						)
					}
				/>
			)}
			{groupedRows.map(({ kind, title, rows: members }) => {
				if (kind !== "doc" && members.length === 0) return null;
				const expanded = expandedKind === kind;
				const controls = `${id}-${kind}`;
				return (
					<section
						key={kind}
						aria-label={title}
						className={`flex min-h-0 min-w-0 flex-col ${expanded ? "flex-1" : "shrink-0"}`}
					>
						<div className="shrink-0">
							<GroupHeader
								group={kind}
								label={title}
								count={members.length}
								appearance="sidebar"
								phone={phone}
								expanded={expanded}
								controls={controls}
								onToggle={() => setExpandedKind(expanded ? null : kind)}
								actions={
									kind === "doc" && onNewDocument !== undefined ? (
										<Tooltip content="New document">
											<IconButton
												size="xs"
												className="pointer-coarse:size-11 pointer-coarse:before:inset-0"
												label="New document"
												icon={<Plus />}
												disabled={newDocumentPending}
												onClick={() => {
													setExpandedKind("doc");
													onNewDocument();
												}}
											/>
										</Tooltip>
									) : undefined
								}
							/>
						</div>
						<div id={controls} hidden={!expanded} className="min-h-0 overflow-y-auto">
							{kind === "doc" && error !== null && body}
							{kind === "doc" && openError !== null && (
								<FailureState
									title="The resource does not load."
									detail={openError}
									action={
										onRetryOpen && (
											<Button size="md" onClick={onRetryOpen}>
												Retry
											</Button>
										)
									}
								/>
							)}
							{kind === "doc" && newDocumentError !== null && (
								<FailureState
									title="The document is not created."
									detail={newDocumentError}
									action={
										onNewDocument && (
											<Button size="md" onClick={onNewDocument}>
												Try again
											</Button>
										)
									}
								/>
							)}
							{members.length > 0 && (
								<ul className="flex min-w-0 flex-col gap-px">
									{members.map((row) => (
										<ResourceRow key={row.id} row={row} onOpen={onOpen} selected={row.id === selectedId} />
									))}
								</ul>
							)}
							{kind === "doc" && error === null && body}
						</div>
					</section>
				);
			})}
		</nav>
	);
}
