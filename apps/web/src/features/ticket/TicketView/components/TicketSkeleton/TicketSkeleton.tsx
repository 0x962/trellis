import { Skeleton } from "@trellis/ui";

export function TicketSkeleton() {
	const main = (
		<div className="mx-auto flex w-full min-w-0 max-w-[856px] flex-col px-5 pt-6 pb-8 max-md:px-4">
			<Skeleton width="w-3/4" height="h-8" className="mt-1" />
			<Skeleton lines={6} width="w-2/3" className="mt-3" />
			<Skeleton height="h-14" className="mt-8" />
			<Skeleton lines={3} height="h-8" className="mt-8" />
		</div>
	);
	return (
		<div className="mt-13 flex min-h-0 flex-1 flex-col">
			<div
				aria-hidden="true"
				className="flex h-10 shrink-0 items-end gap-4 border-b border-border px-5 pb-2 max-md:px-4"
			>
				<Skeleton width="w-12" height="h-4" />
				<Skeleton width="w-10" height="h-4" />
				<Skeleton width="w-14" height="h-4" />
				<Skeleton width="w-10" height="h-4" />
			</div>
			<div className="mt-3 flex min-h-0 flex-1">
				<div className="min-w-0 flex-1 page-card">{main}</div>
				<div className="flex min-h-0 w-70 shrink-0 flex-col page-card border-l border-border px-4 py-3 max-md:hidden">
					<Skeleton lines={4} width="w-40" height="h-4" className="gap-3.5" />
					<div aria-hidden="true" className="my-2 h-px bg-border" />
					<Skeleton lines={2} width="w-40" height="h-4" className="gap-3.5" />
					<div aria-hidden="true" className="my-2 h-px bg-border" />
					<Skeleton lines={2} width="w-40" height="h-4" className="gap-3.5" />
				</div>
			</div>
		</div>
	);
}
