import { X } from "@phosphor-icons/react";
import { type PointerEvent, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { InlineEdit } from "../../../../primitives/InlineEdit";
import { TabsTab } from "../../../../primitives/Tabs";
import { Tooltip } from "../../../../primitives/Tooltip";
import { cx } from "../../../../utils/cx";
import type { PageTabItem } from "../../PageTabs";

type Props = {
	tab: PageTabItem;
	index: number;
	count: number;
	width: number;
	active: boolean;
	separator: boolean;
	onClose: () => void;
	editing: boolean;
	onEditingChange: (focus: boolean) => void;
	onRename: (title: string) => void;
	onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function PageTab({
	tab,
	index,
	count,
	width,
	active,
	separator,
	onClose,
	editing,
	onEditingChange,
	onRename,
	onPointerDown,
}: Props) {
	const label = useRef<HTMLSpanElement>(null);
	const [truncated, setTruncated] = useState(false);
	useLayoutEffect(() => {
		if (editing) return;
		const element = label.current!;
		const measure = () => setTruncated(tab.title.length > 0 && element.scrollWidth > element.clientWidth);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [tab.title, editing]);
	return (
		<div
			role="presentation"
			className={cx(
				"group absolute top-0 left-0 flex h-9 items-center rounded-t-lg border-x border-t max-sm:h-11 pointer-coarse:h-11",
				active ? "z-10 border-border bg-bg text-fg" : "border-transparent text-fg-muted hover:bg-fg/6 hover:text-fg",
				separator && "after:absolute after:right-0 after:top-2.5 after:h-4 after:w-px after:bg-border",
			)}
			style={{ left: index * width, width }}
		>
			<InlineEdit
				label="Tab name"
				value={tab.title}
				editing={editing}
				onEditingChange={(_, focus) => onEditingChange(focus === "value")}
				onSave={async (title) => onRename(title)}
				className="min-w-0 flex-1"
				fieldClassName="px-1"
				inputClassName="h-7 max-sm:h-11"
			>
				<Tooltip content={tab.title} open={truncated ? undefined : false}>
					<TabsTab
						onAuxClick={(event) => {
							if (event.button === 1) {
								event.preventDefault();
								onClose();
							}
						}}
						onMouseDown={(event) => {
							if (event.button === 1) event.preventDefault();
						}}
						value={tab.id}
						tabIndex={active ? 0 : -1}
						data-page-tab-id={tab.id}
						aria-posinset={index + 1}
						aria-setsize={count}
						className="flex h-9 max-sm:h-11 pointer-coarse:h-11 w-full min-w-0 flex-1 items-center rounded-tl-lg px-3 text-left text-sm select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
						onPointerDown={onPointerDown}
					>
						<span ref={label} className={cx("block truncate", active && "font-medium")}>
							{tab.title}
						</span>
					</TabsTab>
				</Tooltip>
			</InlineEdit>
			<Tooltip content={`Close ${tab.title}`}>
				<IconButton
					label={`Close ${tab.title}`}
					icon={<X />}
					size="sm"
					tabIndex={active ? 0 : -1}
					className="mr-1 text-fg-muted max-sm:h-11 max-sm:min-w-11"
					onClick={(event) => {
						event.stopPropagation();
						onClose();
					}}
				/>
			</Tooltip>
		</div>
	);
}
