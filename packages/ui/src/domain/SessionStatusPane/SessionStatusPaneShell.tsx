import { type ReactNode, useId } from "react";
import { ResizeHandle } from "../../primitives/ResizeHandle";
import { cx } from "../../utils/cx";
import { useStatusPaneResize } from "./components/useStatusPaneResize";
import type { SessionStatusPaneProps } from "./types";

export function SessionStatusPaneShell({
	children,
	className,
	resize,
}: {
	children: ReactNode;
	className?: string;
	resize?: SessionStatusPaneProps["resize"];
}) {
	const id = useId();
	const { pane, width, handle } = useStatusPaneResize(resize);
	return (
		<aside
			ref={pane}
			id={id}
			aria-label="Session status"
			style={{ width }}
			className={cx(
				"relative order-none flex h-full min-h-0 w-93.5 shrink-0 flex-col border-s border-border bg-bg",
				"max-md:order-first max-md:h-130 max-md:max-h-130 max-md:w-full max-md:border-s-0 max-md:border-b",
				className,
			)}
		>
			{children}
			{handle !== null && (
				<div className="absolute inset-y-0 left-0 z-10 flex max-md:hidden">
					<ResizeHandle label="Updates width" aria-controls={id} {...handle} />
				</div>
			)}
		</aside>
	);
}
