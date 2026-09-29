import { Plus } from "@phosphor-icons/react";
import {
	type CSSProperties,
	type PointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { IconButton } from "../../primitives/IconButton";
import { TabsList, TabsRoot } from "../../primitives/Tabs";
import { Tooltip } from "../../primitives/Tooltip";
import { PageTab } from "./components/PageTab";
import { TabActions } from "./components/TabActions";
import { TabPicker } from "./components/TabPicker";
import { revealTab, useTabLayout } from "./components/useTabLayout";

export type PageTabItem = { id: string; title: string; pinned: boolean };
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
	onPin?: (id: string, pinned: boolean) => void;
	"aria-label"?: string;
};

// The width of one pinned tab, the `w-24` of PageTab.
const pinnedWidth = 96;

export function PageTabs({
	tabs,
	activeId,
	onAdd,
	onSelect,
	onClose,
	onMove,
	onRename,
	onPin,
	"aria-label": ariaLabel = "Open pages",
}: PageTabsProps) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
	const pinnedCount = tabs.filter((tab) => tab.pinned).length;
	const unpinnedTabs = useMemo(() => tabs.slice(pinnedCount), [tabs, pinnedCount]);
	const activePinned = activeIndex >= 0 && activeIndex < pinnedCount;
	const regionStart = activePinned ? 0 : pinnedCount;
	const regionEnd = activePinned ? pinnedCount - 1 : tabs.length - 1;
	const layout = useTabLayout(unpinnedTabs, activeIndex - pinnedCount);
	const { ref: tabListRef, width: tabWidth } = layout;
	const listRef = useRef<HTMLDivElement>(null);
	const pinnedRef = useRef<HTMLDivElement>(null);
	const focusAfterChange = useRef(false);
	const addButton = useRef<HTMLButtonElement>(null);
	const dragged = useRef<string | null>(null);
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const dragX = useRef(0);
	const pointerStart = useRef<{ id: string; x: number } | null>(null);
	const suppressClick = useRef(false);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const [announcement, setAnnouncement] = useState("");
	const draggedIndex = useMemo(
		() => (draggedId === null ? -1 : tabs.findIndex((tab) => tab.id === draggedId)),
		[tabs, draggedId],
	);
	const draggedPinned = draggedIndex >= 0 && draggedIndex < pinnedCount;
	const draggedUnpinnedIndex = draggedIndex - pinnedCount;
	const renderedIndexes =
		draggedUnpinnedIndex >= 0 && !layout.indexes.includes(draggedUnpinnedIndex)
			? [...layout.indexes, draggedUnpinnedIndex].sort((a, b) => a - b)
			: layout.indexes;
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
	// The drop position of a drag, as an index into `tabs`. A drag stays in
	// the region its tab started in.
	const positionFor = useCallback(
		(clientX: number, pinned: boolean) => {
			const element = (pinned ? pinnedRef : tabListRef).current!;
			const width = pinned ? pinnedWidth : tabWidth;
			const count = pinned ? pinnedCount : tabs.length - pinnedCount;
			const offset = pinned ? 0 : pinnedCount;
			return (
				offset +
				Math.max(
					0,
					Math.min(
						count,
						Math.floor((clientX - element.getBoundingClientRect().left + element.scrollLeft + width / 2) / width),
					),
				)
			);
		},
		[tabListRef, tabWidth, tabs.length, pinnedCount],
	);
	const pointerDown = (id: string, event: PointerEvent<HTMLButtonElement>) => {
		if (!onMove || event.button !== 0 || event.pointerType === "touch") return;
		pointerStart.current = { id, x: event.clientX };
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const pointerMove = (event: PointerEvent) => {
		const start = pointerStart.current;
		if (!start || (Math.abs(event.clientX - start.x) < 6 && dragged.current === null)) return;
		dragged.current = start.id;
		setDraggedId(start.id);
		dragX.current = event.clientX;
		setDropIndex(positionFor(event.clientX, tabs.find((tab) => tab.id === start.id)!.pinned));
	};
	const pointerEnd = (event: PointerEvent) => {
		pointerStart.current = null;
		if (dragged.current === null) return;
		const id = dragged.current,
			index = positionFor(event.clientX, tabs.find((tab) => tab.id === id)!.pinned),
			before = tabs[index]?.id ?? null;
		dragged.current = null;
		setDraggedId(null);
		setDropIndex(null);
		suppressClick.current = true;
		if (before !== id && tabs[index - 1]?.id !== id) move(id, before);
	};

	useEffect(() => {
		if (dropIndex === null) return;
		let frame: number;
		const scroll = () => {
			const element = (draggedPinned ? pinnedRef : tabListRef).current!;
			const bounds = element.getBoundingClientRect();
			const delta = dragX.current < bounds.left + 28 ? -12 : dragX.current > bounds.right - 28 ? 12 : 0;
			if (delta) {
				element.scrollLeft += delta;
				setDropIndex(positionFor(dragX.current, draggedPinned));
			}
			frame = requestAnimationFrame(scroll);
		};
		frame = requestAnimationFrame(scroll);
		return () => cancelAnimationFrame(frame);
	}, [dropIndex, draggedPinned, tabListRef, positionFor]);
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
				onPointerDown={(event) => pointerDown(tab.id, event)}
			/>
		);
	};
	const dropMarker = (left: number) => (
		<div className="pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-round bg-accent" style={{ left }} />
	);
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
					onPointerDownCapture={() => {
						suppressClick.current = false;
					}}
					onPointerMove={pointerMove}
					onPointerUp={pointerEnd}
					onPointerCancel={() => {
						pointerStart.current = null;
						dragged.current = null;
						setDraggedId(null);
						setDropIndex(null);
					}}
					onClickCapture={(event) => {
						if (suppressClick.current) {
							event.preventDefault();
							event.stopPropagation();
							suppressClick.current = false;
						}
					}}
				>
					{pinnedCount > 0 && (
						<div
							ref={pinnedRef}
							className="relative flex h-full max-w-1/2 shrink-0 overflow-x-auto overscroll-x-contain border-r border-border pr-1 mr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						>
							{Array.from({ length: pinnedCount }, (_, index) => pageTab(index, {}))}
							{dropIndex !== null &&
								draggedPinned &&
								dropMarker(Math.min(dropIndex * pinnedWidth, pinnedCount * pinnedWidth - 2))}
						</div>
					)}
					<div
						ref={layout.ref}
						className="relative h-full min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						onScroll={layout.onScroll}
					>
						<div className="relative h-full" style={{ width: unpinnedTabs.length * layout.width }}>
							{renderedIndexes.map((index) =>
								pageTab(pinnedCount + index, { left: index * layout.width, width: layout.width }),
							)}
							{dropIndex !== null &&
								!draggedPinned &&
								dropMarker(Math.min((dropIndex - pinnedCount) * layout.width, unpinnedTabs.length * layout.width - 2))}
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
				{tabs.length > 0 && (onMove || onRename || onPin) && (
					<TabActions
						tabs={tabs}
						activeIndex={activeIndex}
						regionStart={regionStart}
						regionEnd={regionEnd}
						onMove={onMove ? move : undefined}
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
