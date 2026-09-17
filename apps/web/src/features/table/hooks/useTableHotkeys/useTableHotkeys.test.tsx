import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import type { RowSelection } from "../useRowSelection";
import { type TableController, useTableHotkeys } from "./useTableHotkeys";

const selection: RowSelection = {
	selected: [],
	count: 0,
	isSelected: () => false,
	toggle: () => {},
	extend: () => {},
	selectAll: () => {},
	clear: () => {},
};

const openPage = mock();

// The table root of the probe, with a text field and a rich text editor
// inside it. The editor carries the two marks a Tiptap description
// carries: contenteditable and role="textbox".
function Probe() {
	const root = useRef<HTMLElement | null>(null);
	const controller: TableController = {
		root,
		ids: ["CDE-1"],
		focusedId: "CDE-1",
		focus: () => {},
		blur: () => {},
		selection,
		editing: null,
		setEditing: () => {},
		groupKeys: [],
		toggleGroup: () => {},
		openTicket: () => {},
		openPage,
		openComposer: () => {},
		copy: () => {},
		copySelection: () => {},
		requestDelete: () => {},
	};
	useTableHotkeys(controller);
	return (
		// biome-ignore lint/a11y/noNoninteractiveTabindex: the probe focuses the root the way the table does
		<div data-testid="root" ref={root as React.RefObject<HTMLDivElement>} tabIndex={0}>
			<input data-testid="title" />
			{/* biome-ignore lint/a11y/useSemanticElements: the Tiptap description renders a div with this role, and the guard must match it */}
			<div contentEditable role="textbox" data-testid="description" suppressContentEditableWarning tabIndex={0} />
		</div>
	);
}

beforeEach(() => {
	openPage.mockClear();
});

describe("useTableHotkeys", () => {
	test("o opens the focused ticket from the table root", () => {
		const { getByTestId } = render(<Probe />);
		const root = getByTestId("root");
		root.focus();
		fireEvent.keyDown(root, { key: "o" });
		expect(openPage).toHaveBeenCalledWith("CDE-1");
	});

	test("o stays idle in a text field of the table", () => {
		const { getByTestId } = render(<Probe />);
		const title = getByTestId("title");
		title.focus();
		fireEvent.keyDown(title, { key: "o" });
		expect(openPage).not.toHaveBeenCalled();
	});

	test("o stays idle in a description editor of the table", () => {
		const { getByTestId } = render(<Probe />);
		const description = getByTestId("description");
		description.focus();
		fireEvent.keyDown(description, { key: "o" });
		expect(openPage).not.toHaveBeenCalled();
	});
});
