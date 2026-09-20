import type { ReactNode } from "react";

export type OpenReviewButtonProps = { children: ReactNode; onOpen: () => void };

export function OpenReviewButton({ children, onOpen }: OpenReviewButtonProps) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="min-w-0 truncate text-start text-base font-medium text-fg before:absolute before:inset-0"
		>
			{children}
		</button>
	);
}
