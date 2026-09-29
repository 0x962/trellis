import { Plus } from "@phosphor-icons/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { TabsList, TabsRoot } from "../../primitives/Tabs";
import { Tooltip } from "../../primitives/Tooltip";
import { PageTab } from "./components/PageTab";
import { TabActions } from "./components/TabActions";
import { TabGroupHeader } from "./components/TabGroupHeader";
import { TabPicker } from "./components/TabPicker";
import { dropTargetId, slotIndexOf, tabSlots } from "./components/tabSlots";
import { useTabDrag } from "./components/useTabDrag";
import { useTabLayout } from "./components/useTabLayout";

export type PageTabItem = { id: string; title: string; groupId?: string };
export type PageTabGroupItem = { id: string; name: string; collapsed: boolean };
export type PageTabsProps = {
	tabs: readonly PageTabItem[];
	// The groups in strip order. The tabs of one group are contiguous in
	// `tabs`, and a header box precedes them.
	groups?: readonly PageTabGroupItem[];
	activeId: string;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
	onMove?: (id: string, beforeId: string | null) => void;
	onRename?: (id: string, title: string | null) => void;
	// Creates a group that holds the tab, and returns the id of the group.
	onCreateGroup?: (name: string, tabId: string) => string;
	onRenameGroup?: (id: string, name: string) => void;
	onRemoveGroup?: (id: string) => void;
	onGroupCollapse?: (id: string, collapsed: boolean) => void;
	onSetTabGroup?: (tabId: string, groupId: string | null) => void;
	"aria-label"?: string;
};

export function PageTabs({
	tabs,
	groups = [],
	activeId,
	onAdd,
	onSelect,
	onClose,
	onMove,
	onRename,
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
	const slots = useMemo(() => tabSlots(tabs, groups), [tabs, groups]);
	const activeSlot = slotIndexOf(slots, activeId);
	const layout = useTabLayout(slots, activeSlot);
	const focusAfterChange = useRef(false);
	const addButton = useRef<HTMLButtonElement>(null);
	const [announcement, setAnnouncement] = useState("");
	const items = useMemo(() => tabs.map((tab) => ({ value: tab.id })), [tabs]);
	const focusActive = () => {
		const tab = Array.from(layout.ref.current!.querySelectorAll<HTMLElement>('[role="tab"]')).find(
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
		focusAfterChange.current = layout.ref.current!.contains(document.activeElement);
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
	const groupOf = (tabId: string) => tabs.find((tab) => tab.id === tabId)!.groupId ?? null;
	return (
		<div className="relative flex min-w-0 items-end bg-surface px-1 pt-1 text-sm before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border">
			<TabsRoot
				value={activeId}
				onValueChange={(value) => onSelect(value as string)}
				className="flex min-w-0 flex-1 items-end"
			>
				<TabsList
					ref={layout.ref}
					items={items}
					value={activeId}
					onValueChange={select}
					aria-label={ariaLabel}
					className="relative block h-9 min-w-0 flex-1 overflow-x-auto overscroll-x-contain max-sm:h-11 pointer-coarse:h-11 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					onScroll={layout.onScroll}
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
							ArrowLeft: tabs[activeIndex - 1]?.id,
							ArrowRight: activeIndex < tabs.length - 1 ? (tabs[activeIndex + 2]?.id ?? null) : undefined,
							Home: activeIndex > 0 ? tabs[0]!.id : undefined,
							End: activeIndex < tabs.length - 1 ? null : undefined,
						};
						if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
						event.preventDefault();
						event.stopPropagation();
						const target = targets[event.key];
						if (target !== undefined) move(activeId, target);
					}}
					{...drag.listHandlers}
				>
					<div className="relative h-full" style={{ width: slots.length * layout.width }}>
						{renderedIndexes.map((index) => {
							const slot = slots[index]!;
							if (slot.kind === "group")
								return (
									<TabGroupHeader
										key={`group:${slot.group.id}`}
										group={slot.group}
										count={slot.count}
										index={index}
										width={layout.width}
										editing={editingGroupId === slot.group.id}
										onEditingChange={(focus) => {
											setEditingGroupId(focus ? slot.group.id : null);
											focusAfterChange.current = false;
										}}
										onRename={onRenameGroup}
										onRemove={onRemoveGroup}
										onCollapse={onGroupCollapse!}
									/>
								);
							const tab = slot.tab;
							return (
								<PageTab
									key={tab.id}
									tab={tab}
									index={index}
									position={slot.tabIndex}
									count={tabs.length}
									width={layout.width}
									active={tab.id === activeId}
									separator={
										index !== activeSlot &&
										index + 1 !== activeSlot &&
										index < slots.length - 1 &&
										slots[index + 1]!.kind === "tab"
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
						})}
						{drag.dropIndex !== null && (
							<div
								className="pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-round bg-accent"
								style={{ left: Math.min(drag.dropIndex * layout.width, slots.length * layout.width - 2) }}
							/>
						)}
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
				{tabs.length > 0 && (onMove || onRename || onSetTabGroup) && (
					<TabActions
						tabs={tabs}
						groups={groups}
						activeIndex={activeIndex}
						onMove={onMove ? move : undefined}
						onRename={onRename ? () => setEditingId(activeId) : undefined}
						onRestore={onRename ? () => onRename(activeId, null) : undefined}
						onCreateGroup={
							onCreateGroup && onSetTabGroup
								? () => {
										const id = onCreateGroup("New group", activeId);
										setEditingGroupId(id);
									}
								: undefined
						}
						onSetGroup={onSetTabGroup ? (groupId) => onSetTabGroup(activeId, groupId) : undefined}
						currentGroupId={groupOf(activeId)}
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
