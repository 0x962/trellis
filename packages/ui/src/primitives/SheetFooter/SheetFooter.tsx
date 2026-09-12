import type { ReactNode } from "react";

type SheetFooterProps = { leading?: ReactNode; children: ReactNode; confirmation?: ReactNode };

export function SheetFooter({ leading, children, confirmation }: SheetFooterProps) {
	return (
		<footer className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-surface p-4">
			{confirmation}
			<div className="flex items-center gap-2">
				{leading}
				<div className="ml-auto flex items-center gap-2">{children}</div>
			</div>
		</footer>
	);
}
