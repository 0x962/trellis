import { type KeyboardEventHandler, type Ref, useLayoutEffect, useRef } from "react";
import { cx } from "../../../../../../../../utils/cx";
import type { ContentsHeading } from "../../../../DocumentContents";

type Props = {
	heading: ContentsHeading;
	top: number;
	index: number;
	count: number;
	active: boolean;
	focused: boolean;
	instructions: string;
	buttonRef: Ref<HTMLButtonElement>;
	onMeasure: (row: ContentsHeading & { width: number; height: number }) => void;
	onSelect: () => void;
	onFocus: () => void;
	onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
};

export function ContentsRow({
	heading,
	top,
	index,
	count,
	active,
	focused,
	instructions,
	buttonRef,
	onMeasure,
	onSelect,
	onFocus,
	onKeyDown,
}: Props) {
	const row = useRef<HTMLLIElement>(null);
	const { id, level, text } = heading;
	useLayoutEffect(() => {
		const element = row.current!;
		const measure = () => {
			if (element.offsetHeight > 0)
				onMeasure({ id, level, text, width: element.offsetWidth, height: element.offsetHeight });
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [id, level, text, onMeasure]);
	return (
		<li
			ref={row}
			aria-posinset={index + 1}
			aria-setsize={count}
			className="absolute w-full"
			style={{ top, paddingInlineStart: `calc(var(--spacing) * ${(level - 1) * 3})` }}
		>
			<button
				ref={buttonRef}
				type="button"
				tabIndex={focused ? 0 : -1}
				data-heading-id={id}
				aria-describedby={instructions}
				onClick={onSelect}
				onFocus={onFocus}
				onKeyDown={onKeyDown}
				aria-current={active ? "location" : undefined}
				className={cx(
					"flex min-h-[calc(var(--spacing)*var(--contents-row-steps))] w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-fg-muted wrap-anywhere hover:bg-control-hover hover:text-fg active:bg-control-active focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
					active && "sidebar-selected font-medium text-fg",
				)}
			>
				{text || "Untitled heading"}
			</button>
		</li>
	);
}
