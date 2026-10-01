import { Skeleton } from "../../../../primitives/Skeleton";
import { cx } from "../../../../utils/cx";

export type DocumentContentsProps = {
	headings: readonly { id: string; level: number; text: string }[] | null;
	activeId: string | null;
	onSelect: (id: string) => void;
};

export function DocumentContents({ headings, activeId, onSelect }: DocumentContentsProps) {
	return (
		<nav aria-label="Document contents" aria-busy={headings === null} className="min-w-0">
			<h2 className="sidebar-section">Contents</h2>
			{headings === null ? (
				<div role="status" className="px-2 py-2">
					<span className="sr-only">Loading contents…</span>
					<Skeleton lines={3} height="h-4" />
				</div>
			) : headings.length === 0 ? (
				<p className="px-2 py-2 text-sm text-fg-muted">Add headings to show document contents.</p>
			) : (
				<ol>
					{headings.map((heading) => (
						<li key={heading.id} style={{ paddingInlineStart: `calc(var(--spacing) * ${(heading.level - 1) * 3})` }}>
							<button
								type="button"
								onClick={() => onSelect(heading.id)}
								aria-current={activeId === heading.id ? "location" : undefined}
								className={cx(
									"flex min-h-8 w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-fg-muted wrap-anywhere hover:bg-control-hover hover:text-fg active:bg-control-active focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 max-md:min-h-11 pointer-coarse:min-h-11",
									activeId === heading.id && "sidebar-selected font-medium text-fg",
								)}
							>
								{heading.text || "Untitled heading"}
							</button>
						</li>
					))}
				</ol>
			)}
		</nav>
	);
}
