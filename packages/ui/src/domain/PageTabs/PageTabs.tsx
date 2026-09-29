import { Plus } from "@phosphor-icons/react";
import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { TabsList, TabsRoot } from "../../primitives/Tabs";
import { Tooltip } from "../../primitives/Tooltip";
import { PageTab } from "./components/PageTab";
import { TabActions } from "./components/TabActions";
import { TabGroupHeader } from "./components/TabGroupHeader";
import { TabPicker } from "./components/TabPicker";
import { dropTargetId, slotIndexOf, tabSlots } from "./components/tabSlots";
import { useTabDrag } from "./components/useTabDrag";
import { revealTab, useTabLayout } from "./components/useTabLayout";

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

// The width of one pinned tab, the `w-24` of PageTab.
const pinnedWidth = 96;

// The region a tab moves inside: the pinned tabs, its group, or the
// ungrouped tail.
const regionOf = (tab: PageTabItem) => (tab.pinned ? "pinned" : (tab.groupId ?? ""));

export function PageTabs({
	tabs,
	groups = [],
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
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
	const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
	const pinnedCount = tabs.filter((tab) => tab.pinned).length;
	const activePinned = activeIndex >= 0 && activeIndex < pinnedCount;
	const activeRegion = activeIndex >= 0 ? regionOf(tabs[activeIndex]!) : "";
	const regionStart = tabs.findIndex((tab) => regionOf(tab) === activeRegion);
	const regionEnd = tabs.findLastIndex((tab) => regionOf(tab) === activeRegion);
	const slots = useMemo(() => tabSlots(tabs.slice(pinnedCount), groups, pinnedCount), [tabs, pinnedCount, groups]);
	const activeSlot = slotIndexOf(slots, activeId);
	const layout = useTabLayout(slots, activeSlot);
	const listRef = useRef<HTMLDivElement>(null);
	const pinnedRef = useRef<HTMLDivElement>(null);
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
	// The pinned region scrolls on its own, so a narrow strip keeps the
	// active pinned tab in view.
	useLayoutEffect(() => {
		if (activePinned) revealTab(pinnedRef.current!, activeIndex * pinnedWidth, pinnedWidth);
	}, [activePinned, activeIndex]);
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
	const pinnedDrag = useTabDrag({
		listRef: pinnedRef,
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
	const draggedSlot = drag.draggedId === null ? -1 : slotIndexOf(slots, drag.draggedId);
	const renderedIndexes =
		draggedSlot >= 0 && !layout.indexes.includes(draggedSlot)
			? [...layout.indexes, draggedSlot].sort((a, b) => a - b)
			: layout.indexes;
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
				editing={editingId === tab.id}
				onEditingChange={(focus) => {
					setEditingId(null);
					focusAfterChange.current = focus;
				}}
				onRename={(title) => onRename!(tab.id, title)}
				onPointerDown={(event) => pointerDown(tab.id, event)}
			/>
		);
	};
	const dropMarker = (left: number) => (
		<div className="pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-round bg-accent" style={{ left }} />
	);
	const activeGroupId = activeIndex >= 0 ? (tabs[activeIndex]!.groupId ?? null) : null;
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
				>
					{pinnedCount > 0 && (
						<div
							ref={pinnedRef}
							className="relative flex h-full max-w-1/2 shrink-0 overflow-x-auto overscroll-x-contain border-r border-border pr-1 mr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							{...pinnedDrag.listHandlers}
						>
							{Array.from({ length: pinnedCount }, (_, index) =>
								pageTab(
									index,
									{},
									pinnedDrag.pointerDown,
									index !== activeIndex && index + 1 !== activeIndex && index < pinnedCount - 1,
								),
							)}
							{pinnedDrag.dropIndex !== null &&
								dropMarker(Math.min(pinnedDrag.dropIndex * pinnedWidth, pinnedCount * pinnedWidth - 2))}
						</div>
					)}
					<div
						ref={layout.ref}
						className="relative h-full min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
											editing={editingGroupId === slot.group.id}
											onEditingChange={(editing) => setEditingGroupId(editing ? slot.group.id : null)}
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
				{tabs.length > 0 && (onMove || onRename || onPin || onSort || onSetTabGroup) && (
					<TabActions
						tabs={tabs}
						groups={groups}
						activeIndex={activeIndex}
						regionStart={regionStart}
						regionEnd={regionEnd}
						onMove={onMove ? move : undefined}
						onSort={onSort ? sort : undefined}
						onPin={onPin}
						onRename={onRename ? () => setEditingId(activeId) : undefined}
						onRestore={onRename ? () => onRename(activeId, null) : undefined}
						onCreateGroup={
							onCreateGroup && onSetTabGroup ? () => setEditingGroupId(onCreateGroup("New group", activeId)) : undefined
						}
						onSetGroup={onSetTabGroup ? (groupId) => onSetTabGroup(activeId, groupId) : undefined}
						currentGroupId={activeGroupId}
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
