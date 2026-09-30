import { type KeyboardEvent, type RefObject, useRef, useState } from "react";
import type { ContextMenuProps } from "../../../../primitives/ContextMenu";
import type { PageTabsProps } from "../../PageTabs";
import { moveKeys, moveTargetForKey } from "../moveTargets";
import { tabActionItems } from "../tabActionItems";
import { tabRegion } from "../tabRegion";

type Input = Omit<PageTabsProps, "onAdd" | "onSelect"> & {
	listRef: RefObject<HTMLDivElement | null>;
	addButton: RefObject<HTMLButtonElement | null>;
	focusAfterChange: RefObject<boolean | string>;
};

export function useTabContextMenu({
	tabs,
	groups = [],
	activeId,
	onClose,
	onMove,
	onRename,
	onSort,
	onPin,
	onCreateGroup,
	onSetTabGroup,
	listRef,
	addButton,
	focusAfterChange,
}: Input) {
	const [targetId, setTargetId] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
	const [pickerId, setPickerId] = useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const returnFocus = useRef(true);
	const lastTarget = useRef<string | null>(null);
	const target = tabRegion(tabs, targetId ?? activeId);
	const pickerTab = tabs.find((tab) => tab.id === (pickerId ?? activeId));
	const otherGroups = groups.filter((group) => group.id !== pickerTab?.groupId);
	const focusTarget = () => {
		const elements = Array.from(listRef.current!.querySelectorAll<HTMLElement>("[data-page-tab-id]"));
		return (
			elements.find((element) => element.dataset.pageTabId === lastTarget.current) ??
			elements.find((element) => element.dataset.pageTabId === activeId) ??
			addButton.current
		);
	};
	const handOffFocus = (action: () => void) => {
		returnFocus.current = false;
		action();
	};
	const canPickGroup =
		onSetTabGroup !== undefined && pickerTab !== undefined && !pickerTab.pinned && otherGroups.length > 0;
	const items =
		targetId === null || target.activeTab === undefined
			? []
			: tabActionItems({
					tabs,
					targetIndex: target.activeIndex,
					regionStart: target.regionStart,
					regionEnd: target.regionEnd,
					onMove,
					onSort:
						onSort &&
						((direction) => {
							onSort(direction);
							focusAfterChange.current = targetId;
						}),
					onPin:
						onPin &&
						((id, pinned) => {
							focusAfterChange.current = id;
							onPin(id, pinned);
						}),
					onRename: onRename && (() => handOffFocus(() => setEditingId(targetId))),
					onRestore: onRename && (() => onRename(targetId, null)),
					onClose: () => {
						onClose(targetId);
						focusAfterChange.current = true;
					},
					onCreateGroup:
						onCreateGroup &&
						onSetTabGroup &&
						(() => handOffFocus(() => setEditingGroupId(onCreateGroup("New group", targetId)))),
					onPickGroup:
						onSetTabGroup && groups.some((group) => group.id !== target.activeGroupId)
							? () =>
									handOffFocus(() => {
										setPickerId(targetId);
										setPickerOpen(true);
									})
							: undefined,
					onLeaveGroup:
						onSetTabGroup && target.activeGroupId !== null ? () => onSetTabGroup(targetId, null) : undefined,
				});
	const onOpenChange: ContextMenuProps["onOpenChange"] = (next, details) => {
		if (next) {
			const element = (details.event.target as Element).closest<HTMLElement>("[data-page-tab-target]")!;
			lastTarget.current = element.dataset.pageTabTarget!;
			setTargetId(lastTarget.current);
			returnFocus.current = true;
		} else if (details.reason === "outside-press" || details.reason === "focus-out") {
			returnFocus.current = false;
		}
		setOpen(next);
	};
	const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!(event.target instanceof HTMLElement) || event.target.getAttribute("role") !== "tab") return;
		const id = event.target.dataset.pageTabId!;
		if (event.key === "Delete") {
			event.preventDefault();
			event.stopPropagation();
			onClose(id);
			return;
		}
		if (!onMove || !event.altKey || !event.shiftKey) return;
		if (!(moveKeys as readonly string[]).includes(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		const focused = tabRegion(tabs, id);
		const before = moveTargetForKey(event.key, tabs, focused.activeIndex, focused.regionStart, focused.regionEnd);
		if (before !== undefined) onMove(id, before);
	};
	return {
		editingId,
		setEditingId,
		editingGroupId,
		setEditingGroupId,
		retainedIds: [targetId, focusedId, editingId, pickerOpen ? pickerId : null],
		context: {
			label: "Tab actions",
			items,
			open,
			onOpenChange,
			disabled: editingId !== null || editingGroupId !== null,
			onClose: () => setOpen(false),
			onOpenChangeComplete: (next: boolean) => {
				if (next || targetId === null) return;
				// Focus retains a virtual tab before the menu releases its mount.
				if (returnFocus.current) focusTarget()?.focus({ preventScroll: true });
				setTargetId(null);
			},
			// Rename and group actions give focus to their own fields.
			finalFocus: () => (returnFocus.current ? focusTarget() : false),
		},
		list: {
			onKeyDownCapture,
			onFocusCapture: () => setFocusedId((document.activeElement as HTMLElement).dataset.pageTabId ?? null),
			onBlurCapture: () => setFocusedId(null),
		},
		picker: {
			otherGroups,
			canPickGroup,
			groupPickerOpen: pickerOpen,
			onGroupPickerOpenChange: (next: boolean) => {
				setPickerOpen(next);
				setPickerId(null);
			},
			onGroupSelect: (groupId: string) => onSetTabGroup!(pickerId ?? activeId, groupId),
		},
	};
}
