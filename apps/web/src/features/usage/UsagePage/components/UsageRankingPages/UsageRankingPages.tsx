import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";

export function UsageRankingPages({
	label,
	start,
	count,
	total,
	pending,
	onPage,
}: {
	label: string;
	start: number;
	count: number;
	total: number;
	pending: boolean;
	onPage: (direction: -1 | 1) => void;
}) {
	if (total <= count && start === 0) return null;
	return (
		<nav aria-label={`${label} pages`} className="flex items-center justify-between gap-3">
			<span className="text-sm text-fg-muted tabular-nums" aria-live="polite">
				{start + 1}–{start + count} of {total}
			</span>
			<div className="flex items-center gap-2">
				<Tooltip content={`Previous ${label} page`}>
					<IconButton
						label={`Previous ${label} page`}
						icon={<CaretLeft />}
						disabled={pending || start === 0}
						onClick={() => onPage(-1)}
					/>
				</Tooltip>
				<Tooltip content={`Next ${label} page`}>
					<IconButton
						label={`Next ${label} page`}
						icon={<CaretRight />}
						disabled={pending || start + count >= total}
						onClick={() => onPage(1)}
					/>
				</Tooltip>
			</div>
		</nav>
	);
}
