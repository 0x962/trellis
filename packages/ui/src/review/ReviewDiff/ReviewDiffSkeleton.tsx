import { Skeleton } from "../../primitives/Skeleton";

// What the diff pane draws in place of the diff while the revision loads. It
// takes the shape of the toolbar and the code under it, so little moves when
// the revision arrives.
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
