import { EmptyState } from "../../../../primitives/EmptyState";
import { Skeleton } from "../../../../primitives/Skeleton";
import { ContentsList } from "./components/ContentsList";

export type ContentsHeading = { id: string; level: number; text: string };

export type DocumentContentsProps = {
	headings: readonly ContentsHeading[] | null;
	activeId: string | null;
	onSelect: (id: string) => void;
};

export function DocumentContents({ headings, activeId, onSelect }: DocumentContentsProps) {
	return (
		<nav aria-label="Document contents" aria-busy={headings === null} className="flex min-h-0 min-w-0 flex-1 flex-col">
			<h2 className="sidebar-section shrink-0">Contents</h2>
			{headings === null ? (
				<div role="status" className="px-2 py-2">
					<span className="sr-only">Loading contents…</span>
					<Skeleton lines={3} height="h-4" />
				</div>
			) : headings.length === 0 ? (
				<EmptyState description="Add headings to show document contents." className="px-2 py-2" />
			) : (
				<ContentsList headings={headings} activeId={activeId} onSelect={onSelect} />
			)}
		</nav>
	);
}
