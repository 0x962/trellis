import { Button } from "@trellis/ui";

export type ShowMoreRowProps = {
	label: string;
	loading: boolean;
	onLoadMore: () => void;
	top: number;
};

export const showMoreHeight = 40;

// The line under a closed group's last loaded page.
export function ShowMoreRow({ label, loading, onLoadMore, top }: ShowMoreRowProps) {
	return (
		<div
			style={{ height: `${showMoreHeight}px`, transform: `translateY(${top}px)` }}
			className="absolute top-0 left-0 flex w-full items-center border-b border-border px-5"
		>
			<Button variant="quiet" size="sm" disabled={loading} onClick={onLoadMore}>
				Show more {label}
			</Button>
		</div>
	);
}
