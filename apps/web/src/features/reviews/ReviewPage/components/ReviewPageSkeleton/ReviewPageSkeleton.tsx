import { Skeleton } from "@trellis/ui";

// What the page draws in place of the file list and the diff while the
// revision loads. It is one column, like the page it stands in for.
export function ReviewPageSkeleton() {
	return (
		<div className="flex flex-col gap-4" aria-busy="true">
			<span className="sr-only" role="status">
				Loading pull request changes.
			</span>
			<div aria-hidden="true" className="flex flex-col gap-3">
				<Skeleton width="w-12" height="h-4" />
				<Skeleton lines={5} width="w-4/5" />
			</div>
			<div aria-hidden="true" className="flex flex-col gap-4">
				<Skeleton height="h-12" />
				<Skeleton lines={9} />
				<Skeleton width="w-3/4" height="h-12" />
				<Skeleton lines={6} width="w-3/4" />
			</div>
		</div>
	);
}
