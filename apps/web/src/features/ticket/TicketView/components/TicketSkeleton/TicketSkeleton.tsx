import { Skeleton } from "@trellis/ui";

export type TicketSkeletonProps = {
	variant: "page" | "peek";
};

// The shape of a ticket before its row arrives: the ID line, the title
// line, six description lines, one 56 px PR row, and three 32 px activity
// lines, and on the page the rail with its two dividers. The column and
// the gaps match TicketView, so the swap moves nothing.
export function TicketSkeleton({ variant }: TicketSkeletonProps) {
	const main = (
		<div className="flex max-w-[856px] flex-col px-12 pt-8 pb-12 max-md:px-4">
			<Skeleton width="w-16" height="h-3" />
			<Skeleton width="w-3/4" height="h-8" className="mt-1" />
			<Skeleton lines={6} width="w-2/3" className="mt-3" />
			<Skeleton height="h-14" className="mt-8" />
			<Skeleton lines={3} height="h-8" className="mt-8" />
		</div>
	);
	if (variant === "peek") return main;
	return (
		<div className="flex min-h-0 flex-1">
			<div className="min-w-0 flex-1">{main}</div>
			<div className="flex w-70 shrink-0 flex-col border-l border-border px-4 py-3 max-md:hidden">
				<Skeleton lines={4} width="w-40" height="h-4" className="gap-3.5" />
				<div aria-hidden="true" className="my-2 h-px bg-border" />
				<Skeleton lines={2} width="w-40" height="h-4" className="gap-3.5" />
				<div aria-hidden="true" className="my-2 h-px bg-border" />
				<Skeleton lines={2} width="w-40" height="h-4" className="gap-3.5" />
			</div>
		</div>
	);
}
