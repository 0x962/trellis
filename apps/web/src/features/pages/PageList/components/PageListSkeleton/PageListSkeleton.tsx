import { Skeleton } from "@trellis/ui";

const widths = ["w-2/5", "w-1/2", "w-[35%]", "w-[45%]"];

export function PageListSkeleton() {
	return (
		<div role="status" aria-label="Load Pages" aria-busy="true">
			<span className="sr-only">Load Pages</span>
			{widths.map((width) => (
				<div key={width} className="flex h-14 items-center gap-3 border-b border-border px-5 max-md:px-4">
					<div className="min-w-0 flex-1">
						<Skeleton width={width} />
						<Skeleton width="w-3/5" className="mt-1" />
					</div>
					<Skeleton width="w-12" className="max-md:hidden" />
					<Skeleton width="w-24" className="max-md:hidden" />
					<Skeleton width="w-24" className="max-md:hidden" />
					<Skeleton width="w-12" />
				</div>
			))}
		</div>
	);
}
