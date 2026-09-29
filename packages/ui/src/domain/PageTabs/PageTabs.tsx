import { Plus } from "@phosphor-icons/react";
import { type DragEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { TabsList, TabsRoot } from "../../primitives/Tabs";
import { Tooltip } from "../../primitives/Tooltip";
import { PageTab } from "./components/PageTab";
import { TabActions } from "./components/TabActions";
import { TabPicker } from "./components/TabPicker";
import { useTabLayout } from "./components/useTabLayout";

export type PageTabItem = { id: string; title: string };
export type PageTabsProps = {
	tabs: readonly PageTabItem[];
	activeId: string;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
	onMove?: (id: string, beforeId: string | null) => void;
	onRename?: (id: string, title: string | null) => void;
	"aria-label"?: string;
};

export function PageTabs({
	tabs,
	activeId,
	onAdd,
	onSelect,
	onClose,
	onMove,
	onRename,
	"aria-label": ariaLabel = "Open pages",
}: PageTabsProps) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
	const layout = useTabLayout(tabs.length, activeIndex);
	const { ref: tabListRef, width: tabWidth } = layout;
	const focusAfterChange = useRef(false);
	const addButton = useRef<HTMLButtonElement>(null);
	const dragged = useRef<string | null>(null);
	const dragX = useRef(0);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
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
	const positionFor = useCallback(
		(clientX: number) => {
			const element = tabListRef.current!;
			return Math.max(
				0,
				Math.min(
					tabs.length,
					Math.floor((clientX - element.getBoundingClientRect().left + element.scrollLeft + tabWidth / 2) / tabWidth),
				),
			);
		},
		[tabListRef, tabWidth, tabs.length],
	);
	const dragOver = (event: DragEvent) => {
		if (dragged.current === null) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		dragX.current = event.clientX;
		setDropIndex(positionFor(event.clientX));
	};
	useEffect(() => {
		if (dropIndex === null) return;
		let frame: number;
		const scroll = () => {
			const element = tabListRef.current!;
			const bounds = element.getBoundingClientRect();
			const delta = dragX.current < bounds.left + 28 ? -12 : dragX.current > bounds.right - 28 ? 12 : 0;
			if (delta) {
				element.scrollLeft += delta;
				setDropIndex(positionFor(dragX.current));
			}
			frame = requestAnimationFrame(scroll);
		};
		frame = requestAnimationFrame(scroll);
		return () => cancelAnimationFrame(frame);
	}, [dropIndex, tabListRef, positionFor]);
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
					onDragOver={dragOver}
					onDrop={(event) => {
						if (dragged.current === null) return;
						event.preventDefault();
						const id = dragged.current;
						const index = positionFor(event.clientX);
						const before = tabs[index]?.id ?? null;
						dragged.current = null;
						setDropIndex(null);
						if (before !== id && tabs[index - 1]?.id !== id) move(id, before);
					}}
				>
					<div className="relative h-full" style={{ width: tabs.length * layout.width }}>
						{layout.indexes.map((index) => {
							const tab = tabs[index]!;
							return (
								<PageTab
									key={tab.id}
									tab={tab}
									index={index}
									count={tabs.length}
									width={layout.width}
									active={tab.id === activeId}
									separator={index !== activeIndex && index + 1 !== activeIndex && index < tabs.length - 1}
									draggable={onMove !== undefined}
									onClose={() => close(tab.id)}
									editing={editingId === tab.id}
									onEditingChange={(focus) => {
										setEditingId(null);
										focusAfterChange.current = focus;
									}}
									onRename={(title) => onRename!(tab.id, title)}
									onDragStart={() => {
										dragged.current = tab.id;
									}}
									onDragEnd={() => {
										dragged.current = null;
										setDropIndex(null);
									}}
								/>
							);
						})}
						{dropIndex !== null && (
							<div
								className="pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-round bg-accent"
								style={{ left: Math.min(dropIndex * layout.width, tabs.length * layout.width - 2) }}
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
				{tabs.length > 0 && (onMove || onRename) && (
					<TabActions
						tabs={tabs}
						activeIndex={activeIndex}
						onMove={onMove ? move : undefined}
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
