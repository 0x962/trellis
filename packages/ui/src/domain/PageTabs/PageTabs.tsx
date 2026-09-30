import { type CSSProperties, useMemo, useRef, useState } from "react";
import { ContextMenu } from "../../primitives/ContextMenu";
import { TabsList, TabsRoot } from "../../primitives/Tabs";
import { cx } from "../../utils/cx";
import { PageTab } from "./components/PageTab";
import { TabGroupHeader } from "./components/TabGroupHeader";
import { TabStripControls } from "./components/TabStripControls";
import { dropTargetId, slotIndexOf } from "./components/tabSlots";
import { useFocusAfterChange } from "./components/useFocusAfterChange";
import { useTabContextMenu } from "./components/useTabContextMenu";
import { useTabDrag } from "./components/useTabDrag";
import { useTabLayout } from "./components/useTabLayout";
import { useTabRegions } from "./components/useTabRegions";

export type PageTabItem = { id: string; title: string; pinned: boolean; groupId?: string };
export type PageTabGroupItem = { id: string; name: string; collapsed: boolean };
export type PageTabSortDirection = "ascending" | "descending";
export type PageTabsProps = {
	// The pinned tabs come first. The strip draws them in a region of their
	// own before the other tabs, and a move never crosses that boundary.
	tabs: readonly PageTabItem[];
	// The groups in strip order. The tabs of one group are contiguous in
	// `tabs`, after the pinned tabs, and a header box precedes them.
	groups?: readonly PageTabGroupItem[];
	activeId: string;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
	onMove?: (id: string, beforeId: string | null) => void;
	onRename?: (id: string, title: string | null) => void;
	onSort?: (direction: PageTabSortDirection) => void;
	onPin?: (id: string, pinned: boolean) => void;
	// Creates a group that holds the tab, and returns the id of the group.
	onCreateGroup?: (name: string, tabId: string) => string;
	onRenameGroup?: (id: string, name: string) => void;
	onRemoveGroup?: (id: string) => void;
	onGroupCollapse?: (id: string, collapsed: boolean) => void;
	onSetTabGroup?: (tabId: string, groupId: string | null) => void;
	"aria-label"?: string;
};

const pinnedWidth = 96;
const emptyGroups: readonly PageTabGroupItem[] = [];

const regionClass =
	"relative h-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

// Focus, editing, menus, and pointer capture require their target boxes to stay mounted.
const withRetained = (indexes: number[], retained: number[]) =>
	[...new Set([...indexes, ...retained.filter((index) => index >= 0)])].sort((a, b) => a - b);

export function PageTabs({
	tabs,
	groups = emptyGroups,
	activeId,
	onAdd,
	onSelect,
	onClose,
	onMove,
	onRename,
	onSort,
	onPin,
	onCreateGroup,
	onRenameGroup,
	onRemoveGroup,
	onGroupCollapse,
	onSetTabGroup,
	"aria-label": ariaLabel = "Open pages",
}: PageTabsProps) {
	const { activeIndex, pinnedCount, activePinned, slots, activeSlot } = useTabRegions(tabs, groups, activeId);
	const pinnedTabs = useMemo(() => tabs.slice(0, pinnedCount), [tabs, pinnedCount]);
	const pinnedLayout = useTabLayout(pinnedTabs, activePinned ? activeIndex : -1, pinnedWidth);
	const layout = useTabLayout(slots, activeSlot);
	const listRef = useRef<HTMLDivElement>(null);
	const addButton = useRef<HTMLButtonElement>(null);
	const focusAfterChange = useFocusAfterChange(listRef, addButton, activeId);
	const [announcement, setAnnouncement] = useState("");
	const items = useMemo(() => tabs.map((tab) => ({ value: tab.id })), [tabs]);
	const close = (id: string) => {
		focusAfterChange.current = listRef.current!.contains(document.activeElement);
		onClose(id);
	};
	const move = (id: string, beforeId: string | null) => {
		focusAfterChange.current = id;
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
	const menu = useTabContextMenu({
		tabs,
		groups,
		activeId,
		onClose: close,
		onMove: onMove ? move : undefined,
		onSort: onSort ? sort : undefined,
		onRename,
		onPin,
		onCreateGroup,
		onSetTabGroup,
		listRef,
		addButton,
		focusAfterChange,
	});
	const pinnedDrag = useTabDrag({
		listRef: pinnedLayout.ref,
		slotWidth: pinnedWidth,
		slotCount: pinnedCount,
		enabled: onMove !== undefined,
		onDrop: (id, index) => {
			const before = tabs[index]?.id ?? null;
			if (before !== id && tabs[index - 1]?.id !== id) move(id, before);
		},
	});
	const drag = useTabDrag({
		listRef: layout.ref,
		slotWidth: layout.width,
		slotCount: slots.length,
		enabled: onMove !== undefined,
		onDrop: (id, index) => {
			const before = dropTargetId(slots, index);
			const origin = slotIndexOf(slots, id);
			if (before !== id && index !== origin && index !== origin + 1) move(id, before);
		},
	});
	const pinnedIndexes = withRetained(
		pinnedLayout.indexes,
		[...menu.retainedIds, pinnedDrag.draggedId].map((id) => pinnedTabs.findIndex((tab) => tab.id === id)),
	);
	const renderedIndexes = withRetained(layout.indexes, [
		...[...menu.retainedIds, drag.draggedId].map((id) => (id === null ? -1 : slotIndexOf(slots, id))),
		slots.findIndex((slot) => slot.kind === "group" && slot.group.id === menu.editingGroupId),
	]);
	const pageTab = (index: number, style: CSSProperties, pointerDown: typeof drag.pointerDown, separator: boolean) => {
		const tab = tabs[index]!;
		return (
			<PageTab
				key={tab.id}
				tab={tab}
				index={index}
				count={tabs.length}
				style={style}
				active={tab.id === activeId}
				separator={separator}
				onClose={() => close(tab.id)}
				editing={menu.editingId === tab.id}
				menuOpen={menu.context.open}
				onEditingChange={(focus) => {
					menu.setEditingId(null);
					focusAfterChange.current = focus ? tab.id : false;
				}}
				onRename={(title) => onRename!(tab.id, title)}
				onPointerDown={(event) => pointerDown(tab.id, event)}
			/>
		);
	};
	const dropMarker = (left: number) => (
		<div className="pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-round bg-accent" style={{ left }} />
	);
	return (
		<ContextMenu {...menu.context}>
			<div className="relative flex min-w-0 items-end bg-surface px-1 text-sm before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border/60">
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
						className="flex h-8 min-w-0 flex-1 max-sm:h-11 pointer-coarse:h-11"
						{...menu.list}
					>
						<div
							ref={pinnedLayout.ref}
							className={cx(
								regionClass,
								"mr-1 max-w-1/2 shrink-0 border-r border-border/60 pr-1",
								pinnedCount === 0 && "hidden",
							)}
							onScroll={pinnedLayout.onScroll}
							{...pinnedDrag.listHandlers}
						>
							<div className="relative h-full" style={{ width: pinnedCount * pinnedWidth }}>
								{pinnedIndexes.map((index) =>
									pageTab(
										index,
										{ left: index * pinnedWidth, width: pinnedWidth },
										pinnedDrag.pointerDown,
										index !== activeIndex && index + 1 !== activeIndex && index < pinnedCount - 1,
									),
								)}
								{pinnedDrag.dropIndex !== null &&
									dropMarker(Math.min(pinnedDrag.dropIndex * pinnedWidth, pinnedCount * pinnedWidth - 2))}
							</div>
						</div>
						<div
							ref={layout.ref}
							className={cx(regionClass, "min-w-0 flex-1")}
							onScroll={layout.onScroll}
							{...drag.listHandlers}
						>
							<div className="relative h-full" style={{ width: slots.length * layout.width }}>
								{renderedIndexes.map((index) => {
									const slot = slots[index]!;
									const style = { left: index * layout.width, width: layout.width };
									if (slot.kind === "group")
										return (
											<TabGroupHeader
												key={`group:${slot.group.id}`}
												group={slot.group}
												count={slot.count}
												style={style}
												editing={menu.editingGroupId === slot.group.id}
												onEditingChange={(editing) => menu.setEditingGroupId(editing ? slot.group.id : null)}
												onRename={onRenameGroup}
												onRemove={onRemoveGroup}
												onCollapse={onGroupCollapse!}
											/>
										);
									return pageTab(
										slot.tabIndex,
										style,
										drag.pointerDown,
										index !== activeSlot &&
											index + 1 !== activeSlot &&
											index < slots.length - 1 &&
											slots[index + 1]!.kind === "tab",
									);
								})}
								{drag.dropIndex !== null &&
									dropMarker(Math.min(drag.dropIndex * layout.width, slots.length * layout.width - 2))}
							</div>
						</div>
					</TabsList>
				</TabsRoot>
				<TabStripControls
					tabs={tabs}
					activeId={activeId}
					{...menu.picker}
					addButton={addButton}
					onAdd={onAdd}
					onSelect={onSelect}
				/>
				<span role="status" aria-live="polite" className="sr-only">
					{announcement}
				</span>
			</div>
		</ContextMenu>
	);
}
