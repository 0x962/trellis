import { Skeleton } from "@trellis/ui";

const columns = [0, 1, 2];
const cards = [0, 1, 2];

// Three columns of three 76 px cards while the board loads. The header and
// the card sizes match the real board, so the data arrives with no shift.
export function BoardSkeleton() {
	return (
		<div aria-hidden="true" data-board-skeleton="" className="flex min-h-0 flex-1 gap-3 overflow-hidden p-4">
			{columns.map((column) => (
				<div key={column} className="flex w-62 shrink-0 flex-col">
					<div className="flex h-9 items-center gap-2 px-2">
						<Skeleton width="w-20" />
					</div>
					<div className="flex flex-col gap-2 p-1">
						{cards.map((card) => (
							<div
								key={card}
								className="flex h-19 flex-col gap-2 rounded-md border-x border-b border-border bg-band p-3"
							>
								<Skeleton width="w-12" />
								<Skeleton width="w-3/4" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
