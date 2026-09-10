import { Skeleton } from "@trellis/ui";

export type TicketSkeletonProps = {
	variant: "page" | "peek";
};

// The shape of a ticket before its row arrives: a title line, a few
// description lines, one 56 px PR row, and three 32 px activity lines. The
// heights match the real rows, so the swap moves nothing.
export function TicketSkeleton({ variant }: TicketSkeletonProps) {
	const main = (
		<div className="flex max-w-202 flex-col gap-7 px-12 py-5">
			<Skeleton width="w-16" height="h-3" />
			<Skeleton width="w-3/4" height="h-8" />
			<Skeleton lines={3} width="w-2/3" />
			<Skeleton height="h-14" />
			<Skeleton lines={3} height="h-8" />
		</div>
	);
	if (variant === "peek") return main;
	return (
		<div className="flex min-h-0 flex-1">
			<div className="min-w-0 flex-1">{main}</div>
			<div className="w-70 shrink-0 border-l border-border px-4 py-3">
				<Skeleton lines={8} width="w-40" height="h-4" className="gap-4" />
			</div>
		</div>
	);
}
