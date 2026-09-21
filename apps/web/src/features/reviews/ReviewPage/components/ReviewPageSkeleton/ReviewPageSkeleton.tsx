import { Skeleton } from "@trellis/ui";

// What the left pane draws in place of the file tree while the revision loads.
// It takes the shape the tree takes, so no row moves when the revision
// arrives.
export function ReviewTreeSkeleton() {
	return (
		<div className="flex flex-col gap-3 p-5 max-md:px-4" aria-busy="true">
			<span className="sr-only" role="status">
				Loading pull request changes.
			</span>
			<div aria-hidden="true" className="flex items-center justify-between">
				<Skeleton width="w-12" height="h-4" />
				<Skeleton width="w-20" height="h-4" />
			</div>
			<Skeleton lines={6} />
		</div>
	);
}

// What the right pane draws in place of the diff while the revision loads. It
// takes the shape of the toolbar and the code under it.
export function ReviewDiffSkeleton() {
	return (
		<div className="review-diff-window" aria-hidden="true">
			<div className="review-diff-toolbar">
				<Skeleton width="w-32" height="h-8" />
			</div>
			<div className="flex flex-col gap-4 p-5">
				<Skeleton height="h-12" />
				<Skeleton lines={9} />
				<Skeleton width="w-3/4" height="h-12" />
				<Skeleton lines={6} width="w-3/4" />
			</div>
		</div>
	);
}
