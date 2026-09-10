import { useHotkey } from "@trellis/ui";
import type { RefObject } from "react";
import { useStableCallback } from "../../../../hooks/useStableCallback";
import type { EditField } from "../../Row";
import type { RowSelection } from "../useRowSelection";

export type CopyKind = "id" | "branch" | "link";

export type TableController = {
	// The table's root element. The keys act while focus is inside it or
	// on the page body, and never inside a dialog or a text field.
	root: RefObject<HTMLElement | null>;
	// Every ticket id in display order, mounted or not.
	ids: readonly string[];
	focusedId: string | null;
	focus: (id: string) => void;
	blur: () => void;
	selection: RowSelection;
	editing: { id: string; field: EditField } | null;
	setEditing: (editing: { id: string; field: EditField } | null) => void;
	groupKeys: readonly string[];
	toggleGroup: (key: string) => void;
	openPeek: (id: string) => void;
	openPage: (id: string) => void;
	openComposer: () => void;
	copy: (id: string, kind: CopyKind) => void;
	requestDelete: (ids: readonly string[]) => void;
};

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

// The keyboard map of the table, product.md 3.6. Every handler reads the
// controller of the latest render, so the listeners bind once.
export const useTableHotkeys = (controller: TableController) => {
	const active = useStableCallback(() => {
		const element = document.activeElement;
		if (element === null || element === document.body) return true;
		if (element.closest('[role="dialog"]') !== null) return false;
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

	useHotkey("enter", useStableCallback(withFocused((id) => controller.openPeek(id))));
	useHotkey(" ", useStableCallback(withFocused((id) => controller.openPeek(id))));
	useHotkey("o", useStableCallback(withFocused((id) => controller.openPage(id))));
	useHotkey("x", useStableCallback(withFocused((id) => controller.selection.toggle(id))));
	useHotkey("s", useStableCallback(withFocused((id) => controller.setEditing({ id, field: "status" }))));
	useHotkey("p", useStableCallback(withFocused((id) => controller.setEditing({ id, field: "priority" }))));
	useHotkey("shift+p", useStableCallback(withFocused((id) => controller.setEditing({ id, field: "parent" }))));
	useHotkey("m", useStableCallback(withFocused((id) => controller.setEditing({ id, field: "project" }))));
	useHotkey("mod+c", useStableCallback(withFocused((id) => controller.copy(id, "id"))));
	useHotkey("mod+shift+c", useStableCallback(withFocused((id) => controller.copy(id, "branch"))));
	useHotkey("mod+.", useStableCallback(withFocused((id) => controller.copy(id, "link"))));
	useHotkey("backspace", useStableCallback(withFocused((id) => controller.requestDelete([id]))));
	useHotkey("delete", useStableCallback(withFocused((id) => controller.requestDelete([id]))));

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

	// Escape unwinds one layer per press: the open picker, then the
	// selection, then the row focus.
	useHotkey(
		"escape",
		useStableCallback(() => {
			if (!active()) return;
			if (controller.editing !== null) {
				controller.setEditing(null);
				return;
			}
			if (controller.selection.count > 0) {
				controller.selection.clear();
				return;
			}
			controller.blur();
		}),
	);

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
