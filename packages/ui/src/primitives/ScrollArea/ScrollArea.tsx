import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type ScrollAreaProps = {
	children: ReactNode;
	// The height or width that makes the content overflow, such as "h-40".
	className?: string;
};

// A scroll container with a thin themed scrollbar that shows on hover and
// while scrolling. The vertical bar is always mounted so the layout never
// shifts when content grows.
export function ScrollArea({ children, className }: ScrollAreaProps) {
	return (
		<BaseScrollArea.Root className={cx("relative", className)}>
			<BaseScrollArea.Viewport className="size-full overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2">
				{children}
			</BaseScrollArea.Viewport>
			<BaseScrollArea.Scrollbar
				keepMounted
				className="flex w-2 justify-center rounded-sm bg-transparent opacity-0 transition-opacity duration-hover ease-out data-hovering:opacity-100 data-scrolling:opacity-100"
			>
				<BaseScrollArea.Thumb className="w-1 rounded-sm bg-border-strong" />
			</BaseScrollArea.Scrollbar>
		</BaseScrollArea.Root>
	);
}
