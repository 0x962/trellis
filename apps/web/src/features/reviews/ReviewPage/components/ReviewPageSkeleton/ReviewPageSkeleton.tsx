import { Skeleton } from "@trellis/ui";

// What the page draws in place of the file list and the diff while the
// revision loads. It takes the shape those two take, so nothing on the page
// moves when the revision arrives: a block of file rows, then the bordered
// box that the diff scrolls in.
export function ReviewPageSkeleton() {
	return (
		<>
			<div className="flex flex-col gap-3" aria-busy="true">
				<span className="sr-only" role="status">
					Loading pull request changes.
				</span>
				<div aria-hidden="true" className="flex items-center justify-between">
					<Skeleton width="w-12" height="h-4" />
					<Skeleton width="w-20" height="h-4" />
				</div>
				<Skeleton lines={6} />
			</div>
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
		</>
	);
}
