export type WipBadgeProps = {
	count: number;
	limit: number;
};

export function WipBadge({ count, limit }: WipBadgeProps) {
	const warning = count > limit;
	return (
		<span
			data-state={warning ? "warning" : "ok"}
			className={`inline-flex h-5 items-center rounded-xl px-1.75 text-xs font-medium tabular ${warning ? "bg-warning-soft text-warning" : "text-fg-muted"}`}
		>
			{count}/{limit}
		</span>
	);
}
