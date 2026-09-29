import { Plus, X } from "@phosphor-icons/react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { TabsList, TabsRoot, TabsTab } from "../../primitives/Tabs";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";

export type PageTabItem = {
	id: string;
	title: string;
};

export type PageTabsProps = {
	tabs: readonly PageTabItem[];
	activeId: string;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
	"aria-label"?: string;
};

const tabWidthPx = 160;
const tabGapPx = 2;
const tabStepPx = tabWidthPx + tabGapPx;
const tabOverscan = 3;

type TabRange = {
	start: number;
	end: number;
};

const rangeAround = (index: number, count: number): TabRange => ({
	start: Math.max(0, index - tabOverscan),
	end: Math.min(count - 1, index + tabOverscan),
});

const rangeInView = (element: HTMLDivElement, count: number): TabRange => ({
	start: Math.max(0, Math.floor(element.scrollLeft / tabStepPx) - tabOverscan),
	end: Math.min(count - 1, Math.ceil((element.scrollLeft + element.clientWidth) / tabStepPx) + tabOverscan),
});

const scrollTabIntoView = (element: HTMLDivElement, index: number) => {
	const tabLeft = index * tabStepPx;
	const tabRight = tabLeft + tabWidthPx;
	if (tabLeft < element.scrollLeft) element.scrollLeft = tabLeft;
	if (tabRight > element.scrollLeft + element.clientWidth) element.scrollLeft = tabRight - element.clientWidth;
};

export function PageTabs({
	tabs,
	activeId,
	onAdd,
	onSelect,
	onClose,
	"aria-label": ariaLabel = "Open pages",
}: PageTabsProps) {
	const tabListElement = useRef<HTMLDivElement>(null);
	const focusActiveAfterChange = useRef(false);
	const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
	const [renderRange, setRenderRange] = useState(() => rangeAround(activeIndex, tabs.length));
	const items = useMemo(() => tabs.map((tab) => ({ value: tab.id })), [tabs]);
	const renderedIndexes = useMemo(() => {
		const indexes = Array.from(
			{ length: Math.max(0, renderRange.end - renderRange.start + 1) },
			(_, offset) => renderRange.start + offset,
		).filter((index) => index < tabs.length);
		if (!indexes.includes(activeIndex)) indexes.push(activeIndex);
		return indexes.sort((left, right) => left - right);
	}, [activeIndex, renderRange, tabs.length]);
	const updateRenderRange = useCallback(
		(element: HTMLDivElement) => {
			const nextRange = rangeInView(element, tabs.length);
			setRenderRange((currentRange) =>
				currentRange.start === nextRange.start && currentRange.end === nextRange.end ? currentRange : nextRange,
			);
		},
		[tabs.length],
	);

	useLayoutEffect(() => {
		const element = tabListElement.current;
		if (!element) return;
		scrollTabIntoView(element, activeIndex);
		updateRenderRange(element);
		const activeTab = Array.from(element.querySelectorAll<HTMLElement>('[role="tab"]')).find(
			(tabElement) => tabElement.dataset.pageTabId === activeId,
		);
		if (focusActiveAfterChange.current) activeTab?.focus();
		focusActiveAfterChange.current = false;
		const resizeObserver = new ResizeObserver(() => {
			scrollTabIntoView(element, activeIndex);
			updateRenderRange(element);
		});
		resizeObserver.observe(element);
		return () => resizeObserver.disconnect();
	}, [activeId, activeIndex, updateRenderRange]);

	return (
		<div className="flex min-w-0 items-end border-b border-border bg-surface px-1 text-sm">
			<TabsRoot
				value={activeId}
				onValueChange={(value) => onSelect(value as string)}
				className="flex min-w-0 flex-1 items-end"
			>
				<TabsList
					items={items}
					value={activeId}
					onValueChange={(value) => {
						focusActiveAfterChange.current = true;
						onSelect(value);
					}}
					ref={tabListElement}
					aria-label={ariaLabel}
					className="relative block h-8 min-w-0 flex-1 overflow-x-auto"
					onScroll={(event) => updateRenderRange(event.currentTarget)}
				>
					<div className="relative h-full" style={{ width: tabs.length * tabStepPx - tabGapPx }}>
						{renderedIndexes.map((index) => {
							const tab = tabs[index]!;
							const active = tab.id === activeId;
							return (
								<div
									key={tab.id}
									className={cx(
										"absolute top-0 left-0 flex h-8 items-center rounded-t-md border-x border-t",
										active
											? "border-border bg-bg text-fg"
											: "border-transparent text-fg-muted hover:bg-fg/6 hover:text-fg",
									)}
									style={{ transform: `translateX(${index * tabStepPx}px)`, width: tabWidthPx }}
								>
									<TabsTab
										value={tab.id}
										data-page-tab-id={tab.id}
										title={tab.title}
										className={cx(
											"h-8 min-w-0 flex-1 truncate rounded-tl-md px-2 font-medium select-none",
											"focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
											hitArea.tab32,
										)}
									>
										{tab.title}
									</TabsTab>
									<Tooltip content={`Close ${tab.title}`}>
										<IconButton
											label={`Close ${tab.title}`}
											icon={<X />}
											size="xs"
											tabIndex={active ? 0 : -1}
											className="mr-1"
											onClick={(event) => {
												focusActiveAfterChange.current = event.detail === 0;
												onClose(tab.id);
											}}
										/>
									</Tooltip>
								</div>
							);
						})}
					</div>
				</TabsList>
			</TabsRoot>
			<div className="flex shrink-0 items-center border-l border-border bg-surface pl-1">
				<Tooltip content="Add tab">
					<IconButton label="Add tab" icon={<Plus />} size="xs" onClick={onAdd} />
				</Tooltip>
			</div>
		</div>
	);
}
