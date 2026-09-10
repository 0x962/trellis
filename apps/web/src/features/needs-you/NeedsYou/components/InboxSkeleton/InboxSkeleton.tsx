import { Skeleton } from "@trellis/ui";

// Placeholder rows for a cold read. They are the height of a real row, so
// the page does not jump when the rows arrive.
export function InboxSkeleton() {
	return (
		<div aria-busy="true">
			{[0, 1, 2, 3, 4, 5].map((row) => (
				<div key={row} data-skeleton-row="" className="flex h-9 items-center gap-3 border-b border-border px-5">
					<Skeleton width="w-3.5" height="h-3.5" />
					<Skeleton width="w-16" />
					<Skeleton width="w-64" />
				</div>
			))}
		</div>
	);
}
