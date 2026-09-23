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
