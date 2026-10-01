import { PushPinSimple, X } from "@phosphor-icons/react";
import { type CSSProperties, type PointerEvent, useLayoutEffect, useRef, useState } from "react";
import { ContextMenuTrigger } from "../../../../primitives/ContextMenuTrigger";
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
	style: CSSProperties;
	active: boolean;
	onClose: () => void;
	editing: boolean;
	menuOpen: boolean;
	onEditingChange: (focus: boolean) => void;
	onRename: (title: string) => void;
	onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
};

// One tab of the strip. Pinned tabs require deliberate closure to prevent
// accidental clicks in the narrow tab area.
export function PageTab({
	tab,
	index,
	count,
	style,
	active,
	onClose,
	editing,
	menuOpen,
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
		<ContextMenuTrigger
			role="presentation"
			data-page-tab-target={tab.id}
			onClickCapture={(event) => {
				if (menuOpen) {
					event.preventDefault();
					event.stopPropagation();
				}
			}}
			className={cx(
				"group absolute top-0 left-0 flex h-8 items-center rounded-md max-sm:h-11 pointer-coarse:h-11",
				active ? "bg-surface text-fg ring-1 ring-inset ring-border" : "text-fg-muted hover:bg-surface hover:text-fg",
			)}
			style={style}
		>
			<InlineEdit
				label="Tab name"
				value={tab.title}
				editing={editing}
				onEditingChange={(_, focus) => onEditingChange(focus === "value")}
				onSave={async (title) => onRename(title)}
				className="min-w-0 flex-1"
				fieldClassName="px-1"
				inputClassName="h-7 max-sm:h-11 pointer-coarse:h-11"
			>
				<Tooltip
					content={tab.title}
					className="max-w-[min(24rem,calc(100vw-var(--spacing)*4))] break-words"
					open={truncated || tab.pinned ? undefined : false}
				>
					<TabsTab
						aria-haspopup="menu"
						onAuxClick={(event) => {
							if (event.button === 1 && !tab.pinned) {
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
						data-pinned={tab.pinned || undefined}
						aria-label={tab.pinned ? `Pinned: ${tab.title}` : undefined}
						aria-posinset={index + 1}
						aria-setsize={count}
						className={cx(
							"flex h-8 max-sm:h-11 pointer-coarse:h-11 w-full min-w-7 max-sm:min-w-11 pointer-coarse:min-w-11 flex-1 items-center gap-1.5 rounded-md text-left text-sm font-medium select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
							tab.pinned ? "px-1.5" : "px-2",
						)}
						onPointerDown={onPointerDown}
					>
						{tab.pinned && <PushPinSimple aria-hidden="true" className="size-3 shrink-0" />}
						<span ref={label} className="block truncate">
							{tab.title}
						</span>
					</TabsTab>
				</Tooltip>
			</InlineEdit>
			{!tab.pinned && (
				<Tooltip content={`Close ${tab.title}`}>
					<IconButton
						label={`Close ${tab.title}`}
						icon={<X />}
						size="sm"
						tabIndex={active ? 0 : -1}
						className="mr-1 text-fg-muted focus-visible:-outline-offset-2! max-sm:h-11 max-sm:min-w-11"
						onClick={(event) => {
							event.stopPropagation();
							onClose();
						}}
					/>
				</Tooltip>
			)}
		</ContextMenuTrigger>
	);
}
