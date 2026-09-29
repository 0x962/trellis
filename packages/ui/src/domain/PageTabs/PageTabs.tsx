import { Plus } from "@phosphor-icons/react";
import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { TabsList, TabsRoot } from "../../primitives/Tabs";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";
import { PageTab } from "./components/PageTab";
import { TabActions } from "./components/TabActions";
import { TabPicker } from "./components/TabPicker";
import { useTabDrag } from "./components/useTabDrag";
import { useTabLayout } from "./components/useTabLayout";

export type PageTabItem = { id: string; title: string; pinned: boolean };
export type PageTabSortDirection = "ascending" | "descending";
export type PageTabsProps = {
	// The pinned tabs come first. The strip draws them in a region of their
	// own before the other tabs, and a move never crosses that boundary.
	tabs: readonly PageTabItem[];
	activeId: string;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
	onMove?: (id: string, beforeId: string | null) => void;
	onRename?: (id: string, title: string | null) => void;
	onSort?: (direction: PageTabSortDirection) => void;
	onPin?: (id: string, pinned: boolean) => void;
	"aria-label"?: string;
};

const pinnedWidth = 96;

const regionClass =
	"relative h-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

// The mounted tabs of one region: the tabs near its viewport, plus the tab
// under a drag so its control keeps the pointer capture.
const withDragged = (indexes: number[], dragged: number) =>
	dragged >= 0 && !indexes.includes(dragged) ? [...indexes, dragged].sort((a, b) => a - b) : indexes;

export function PageTabs({
	tabs,
	activeId,
	onAdd,
	onSelect,
	onClose,
	onMove,
	onRename,
	onSort,
	onPin,
	"aria-label": ariaLabel = "Open pages",
}: PageTabsProps) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
	const pinnedCount = tabs.filter((tab) => tab.pinned).length;
	const pinnedTabs = useMemo(() => tabs.slice(0, pinnedCount), [tabs, pinnedCount]);
	const unpinnedTabs = useMemo(() => tabs.slice(pinnedCount), [tabs, pinnedCount]);
	const activePinned = activeIndex >= 0 && activeIndex < pinnedCount;
	const regionStart = activePinned ? 0 : pinnedCount;
	const regionEnd = activePinned ? pinnedCount - 1 : tabs.length - 1;
	const pinnedLayout = useTabLayout(pinnedTabs, activePinned ? activeIndex : -1, pinnedWidth);
	const layout = useTabLayout(unpinnedTabs, activeIndex - pinnedCount);
	const listRef = useRef<HTMLDivElement>(null);
	const focusAfterChange = useRef(false);
	const addButton = useRef<HTMLButtonElement>(null);
	const [announcement, setAnnouncement] = useState("");
	const items = useMemo(() => tabs.map((tab) => ({ value: tab.id })), [tabs]);
	const focusActive = () => {
		const tab = Array.from(listRef.current!.querySelectorAll<HTMLElement>('[role="tab"]')).find(
			(element) => element.dataset.pageTabId === activeId,
		);
		(tab ?? addButton.current)?.focus({ preventScroll: true });
	};
	useLayoutEffect(() => {
		if (focusAfterChange.current) {
			focusActive();
			focusAfterChange.current = false;
		}
	});
	const close = (id: string) => {
		focusAfterChange.current = listRef.current!.contains(document.activeElement);
		onClose(id);
	};
	const move = (id: string, beforeId: string | null) => {
		focusAfterChange.current = true;
		onMove!(id, beforeId);
		const title = tabs.find((tab) => tab.id === id)!.title;
		setAnnouncement(
			`${title} moved ${beforeId === null ? "to the end" : `before ${tabs.find((tab) => tab.id === beforeId)!.title}`}.`,
		);
	};
	const select = (id: string) => {
		focusAfterChange.current = true;
		onSelect(id);
	};
	const sort = (direction: PageTabSortDirection) => {
		focusAfterChange.current = true;
		onSort!(direction);
		setAnnouncement(`Tabs sorted ${direction === "ascending" ? "A to Z" : "Z to A"}.`);
	};
	const drag = useTabDrag({
		tabs,
		pinned: { ref: pinnedLayout.ref, width: pinnedWidth, offset: 0, count: pinnedCount },
		unpinned: { ref: layout.ref, width: layout.width, offset: pinnedCount, count: unpinnedTabs.length },
		enabled: onMove !== undefined,
		move,
	});
	const pageTab = (index: number, style: CSSProperties) => {
		const tab = tabs[index]!;
		return (
			<PageTab
				key={tab.id}
				tab={tab}
				index={index}
				count={tabs.length}
				style={style}
				active={tab.id === activeId}
				separator={
					index !== activeIndex && index + 1 !== activeIndex && index < tabs.length - 1 && index + 1 !== pinnedCount
				}
				onClose={() => close(tab.id)}
				editing={editingId === tab.id}
				onEditingChange={(focus) => {
					setEditingId(null);
					focusAfterChange.current = focus;
				}}
				onRename={(title) => onRename!(tab.id, title)}
				onPointerDown={(event) => drag.pointerDown(tab.id, event)}
			/>
		);
	};
	const dropMarker = (left: number) => (
		<div className="pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-round bg-accent" style={{ left }} />
	);
	const pinnedIndexes = withDragged(pinnedLayout.indexes, drag.draggedPinned ? drag.draggedIndex : -1);
	const unpinnedIndexes = withDragged(layout.indexes, drag.draggedPinned ? -1 : drag.draggedIndex - pinnedCount);
	return (
		<div className="relative flex min-w-0 items-end bg-surface px-1 pt-1 text-sm before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border">
			<TabsRoot
				value={activeId}
				onValueChange={(value) => onSelect(value as string)}
				className="flex min-w-0 flex-1 items-end"
			>
				<TabsList
					ref={listRef}
					items={items}
					value={activeId}
					onValueChange={select}
					aria-label={ariaLabel}
					className="flex h-9 min-w-0 flex-1 max-sm:h-11 pointer-coarse:h-11"
					onKeyDownCapture={(event) => {
						if (!(event.target instanceof HTMLElement) || event.target.getAttribute("role") !== "tab") return;
						if (event.key === "Delete") {
							event.preventDefault();
							event.stopPropagation();
							close(activeId);
							return;
						}
						if (!onMove || !event.altKey || !event.shiftKey) return;
						const targets: Record<string, string | null | undefined> = {
							ArrowLeft: activeIndex > regionStart ? tabs[activeIndex - 1]!.id : undefined,
							ArrowRight: activeIndex < regionEnd ? (tabs[activeIndex + 2]?.id ?? null) : undefined,
							Home: activeIndex > regionStart ? tabs[regionStart]!.id : undefined,
							End: activeIndex < regionEnd ? (tabs[regionEnd + 1]?.id ?? null) : undefined,
						};
						if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
						event.preventDefault();
						event.stopPropagation();
						const target = targets[event.key];
						if (target !== undefined) move(activeId, target);
					}}
					{...drag.listHandlers}
				>
					<div
						ref={pinnedLayout.ref}
						className={cx(
							regionClass,
							"mr-1 max-w-1/2 shrink-0 border-r border-border pr-1",
							pinnedCount === 0 && "hidden",
						)}
						onScroll={pinnedLayout.onScroll}
					>
						<div className="relative h-full" style={{ width: pinnedCount * pinnedWidth }}>
							{pinnedIndexes.map((index) => pageTab(index, { left: index * pinnedWidth, width: pinnedWidth }))}
							{drag.dropIndex !== null &&
								drag.draggedPinned &&
								dropMarker(Math.min(drag.dropIndex * pinnedWidth, pinnedCount * pinnedWidth - 2))}
						</div>
					</div>
					<div ref={layout.ref} className={cx(regionClass, "min-w-0 flex-1")} onScroll={layout.onScroll}>
						<div className="relative h-full" style={{ width: unpinnedTabs.length * layout.width }}>
							{unpinnedIndexes.map((index) =>
								pageTab(pinnedCount + index, { left: index * layout.width, width: layout.width }),
							)}
							{drag.dropIndex !== null &&
								!drag.draggedPinned &&
								dropMarker(
									Math.min((drag.dropIndex - pinnedCount) * layout.width, unpinnedTabs.length * layout.width - 2),
								)}
						</div>
					</div>
				</TabsList>
			</TabsRoot>
			<div className="relative flex h-9 shrink-0 items-center gap-1 px-1 max-sm:h-11 pointer-coarse:h-11">
				<Tooltip content="Add tab">
					<IconButton
						ref={addButton}
						label="Add tab"
						icon={<Plus />}
						onClick={onAdd}
						className="max-sm:h-11 max-sm:min-w-11"
					/>
				</Tooltip>
				<TabPicker tabs={tabs} activeId={activeId} onSelect={onSelect} />
				{tabs.length > 0 && (onMove || onRename || onPin || onSort) && (
					<TabActions
						tabs={tabs}
						activeIndex={activeIndex}
						regionStart={regionStart}
						regionEnd={regionEnd}
						onMove={onMove ? move : undefined}
						onSort={onSort ? sort : undefined}
						onPin={onPin}
						onRename={onRename ? () => setEditingId(activeId) : undefined}
						onRestore={onRename ? () => onRename(activeId, null) : undefined}
						onClose={() => close(activeId)}
					/>
				)}
			</div>
			<span role="status" aria-live="polite" className="sr-only">
				{announcement}
			</span>
		</div>
	);
}
