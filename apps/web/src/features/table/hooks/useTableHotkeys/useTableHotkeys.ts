import { isTextEntry, useHotkey } from "@trellis/ui";
import type { RefObject } from "react";
import { useStableCallback } from "../../../../hooks/useStableCallback";
import { useEscapeLayer } from "../../../../lib/hotkeys";
import type { EditField } from "../../Row";
import type { RowSelection } from "../useRowSelection";

export type CopyKind = "id" | "branch" | "link";

export type TableController = {
	// The table's root element. The keys act while focus is inside it or
	// on the page body, and never inside a dialog or a text field.
	root: RefObject<HTMLElement | null>;
	// The id of every row a person can see, in display order. A row inside a
	// collapsed group is not one of them.
	ids: readonly string[];
	focusedId: string | null;
	focus: (id: string) => void;
	blur: () => void;
	selection: RowSelection;
	editing: { id: string; field: EditField } | null;
	setEditing: (editing: { id: string; field: EditField } | null) => void;
	// Opens the picker of that field. While rows are selected it opens the
	// picker in the bulk bar, which writes to every selected row. With no
	// selection it opens the picker on the row that holds the focus.
	openField: (id: string, field: EditField) => void;
	groupKeys: readonly string[];
	toggleGroup: (key: string) => void;
	openTicket: (id: string) => void;
	openPage: (id: string) => void;
	openComposer: () => void;
	copy: (id: string, kind: CopyKind) => void;
	// Copies the IDs of the selection, one per line.
	copySelection: () => void;
	requestDelete: (ids: readonly string[]) => void;
};

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

// The keyboard map of the table. Every handler reads the
// controller of the latest render, so the listeners bind once.
export const useTableHotkeys = (controller: TableController) => {
	const active = useStableCallback(() => {
		const element = document.activeElement;
		if (element === null || element === document.body) return true;
		if (element.closest('[role="dialog"]') !== null) return false;
		// A bulk bar picker returns the focus to its button when it closes. The
		// bar acts on the table selection, so the table keys stay live there.
		if (element.closest("[data-bulk-bar]") !== null) return true;
		return controller.root.current?.contains(element) ?? false;
	});

	const focused = useStableCallback(() => (active() ? controller.focusedId : null));

	const move = useStableCallback((step: number, extend: boolean, event: KeyboardEvent) => {
		if (!active()) return;
		event.preventDefault();
		const { ids, focusedId, selection } = controller;
		const index = focusedId === null ? -1 : ids.indexOf(focusedId);
		const next = ids[Math.min(Math.max(index + step, 0), ids.length - 1)];
		if (next === undefined) return;
		if (extend) {
			if (selection.count === 0 && focusedId !== null) selection.toggle(focusedId);
			selection.extend(next);
		}
		controller.focus(next);
	});

	const withFocused = (action: (id: string, event: KeyboardEvent) => void) => (event: KeyboardEvent) => {
		const id = focused();
		if (id === null) return;
		event.preventDefault();
		action(id, event);
	};

	useHotkey(
		"j",
		useStableCallback((event) => move(1, false, event)),
	);
	useHotkey(
		"arrowdown",
		useStableCallback((event) => move(1, false, event)),
	);
	useHotkey(
		"k",
		useStableCallback((event) => move(-1, false, event)),
	);
	useHotkey(
		"arrowup",
		useStableCallback((event) => move(-1, false, event)),
	);
	useHotkey(
		"shift+j",
		useStableCallback((event) => move(1, true, event)),
	);
	useHotkey(
		"shift+arrowdown",
		useStableCallback((event) => move(1, true, event)),
	);
	useHotkey(
		"shift+k",
		useStableCallback((event) => move(-1, true, event)),
	);
	useHotkey(
		"shift+arrowup",
		useStableCallback((event) => move(-1, true, event)),
	);

	// Enter and Space open the ticket of the focused row. The table reads
	// them on a listener of the document, in the capture phase, so a control
	// inside the table never sees them first. The pull request line and the
	// agent line are such controls, and each one answers Enter and Space
	// itself, so the table leaves the key alone while the focus sits on one.
	const openFocusedTicket = useStableCallback((event: KeyboardEvent) => {
		const target = event.target;
		if (target instanceof Element && target.closest('button, [role="button"]') !== null) return;
		withFocused((id) => controller.openTicket(id))(event);
	});
	useHotkey("enter", openFocusedTicket);
	useHotkey(" ", openFocusedTicket);
	useHotkey("o", useStableCallback(withFocused((id) => controller.openPage(id))));
	useHotkey("x", useStableCallback(withFocused((id) => controller.selection.toggle(id))));
	useHotkey("s", useStableCallback(withFocused((id) => controller.openField(id, "status"))));
	useHotkey("p", useStableCallback(withFocused((id) => controller.openField(id, "priority"))));
	useHotkey("shift+p", useStableCallback(withFocused((id) => controller.openField(id, "parent"))));
	useHotkey("l", useStableCallback(withFocused((id) => controller.openField(id, "labels"))));
	useHotkey("e", useStableCallback(withFocused((id) => controller.openField(id, "epic"))));
	useHotkey("w", useStableCallback(withFocused((id) => controller.openField(id, "wave"))));
	// One rule for every key of this block: with a selection it writes to the
	// selected rows, and with no selection it writes to the focused row. The
	// position of the focused row inside or outside the selection changes
	// nothing.
	useHotkey(
		"mod+c",
		useStableCallback(
			withFocused((id) => (controller.selection.count > 0 ? controller.copySelection() : controller.copy(id, "id"))),
		),
	);
	useHotkey("mod+shift+c", useStableCallback(withFocused((id) => controller.copy(id, "branch"))));
	useHotkey("mod+.", useStableCallback(withFocused((id) => controller.copy(id, "link"))));
	const deleteTargets = (id: string) => (controller.selection.count > 0 ? controller.selection.selected : [id]);
	useHotkey("backspace", useStableCallback(withFocused((id) => controller.requestDelete(deleteTargets(id)))));
	useHotkey("delete", useStableCallback(withFocused((id) => controller.requestDelete(deleteTargets(id)))));

	useHotkey(
		"c",
		useStableCallback((event) => {
			if (!active()) return;
			event.preventDefault();
			controller.openComposer();
		}),
	);

	useHotkey(
		"mod+a",
		useStableCallback((event) => {
			if (!active()) return;
			event.preventDefault();
			controller.selection.selectAll();
		}),
	);

	useEscapeLayer("popover", controller.editing !== null, () => {
		if (!active() || isTextEntry(document.activeElement)) return false;
		controller.setEditing(null);
	});
	useEscapeLayer("selection", controller.selection.count > 0, () => {
		if (!active() || isTextEntry(document.activeElement)) return false;
		controller.selection.clear();
	});

	for (const digit of digits) {
		// biome-ignore lint/correctness/useHookAtTopLevel: the digits are a fixed list, so the hooks run in one order.
		useHotkey(
			digit,
			// biome-ignore lint/correctness/useHookAtTopLevel: the digits are a fixed list, so the hooks run in one order.
			useStableCallback(() => {
				if (!active()) return;
				const key = controller.groupKeys[Number(digit) - 1];
				if (key !== undefined) controller.toggleGroup(key);
			}),
		);
	}
};
