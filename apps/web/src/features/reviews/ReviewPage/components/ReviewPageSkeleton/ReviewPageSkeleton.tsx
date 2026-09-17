import { Skeleton } from "@trellis/ui";

export function ReviewPageSkeleton() {
	return (
		<div className="review-main" aria-busy="true">
			<span className="sr-only" role="status">
				Loading pull request changes.
			</span>
			<aside className="review-files p-3" aria-hidden="true">
				<Skeleton width="w-12" height="h-4" className="mb-3" />
				<Skeleton height="h-8" className="mb-4" />
				<Skeleton lines={7} width="w-4/5" />
			</aside>
			<div className="review-content" aria-hidden="true">
				<div className="review-diff-toolbar">
					<Skeleton width="w-32" height="h-8" />
				</div>
				<div className="review-scroll flex flex-col gap-4">
					<Skeleton height="h-12" />
					<Skeleton lines={9} />
					<Skeleton width="w-3/4" height="h-12" className="mt-4" />
					<Skeleton lines={6} width="w-3/4" />
				</div>
			</div>
		</div>
	);
}
