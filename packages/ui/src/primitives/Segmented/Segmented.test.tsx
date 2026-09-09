import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses, expectFocusRing, expectHitArea } from "../../../test/classes";
import { Segmented } from "./Segmented";

describe("Segmented", () => {
	test("radiogroup segments with arrow-key selection", async () => {
		const user = userEvent.setup();
		const onValueChange = mock();
		render(
			<Segmented
				label="View"
				options={[
					{ value: "Table", label: "Table" },
					{ value: "Board", label: "Board" },
				]}
				value="Table"
				onValueChange={onValueChange}
			/>,
		);
		const group = screen.getByRole("radiogroup", { name: "View" });
		expectClasses(group, "rounded-md");
		expect(group.classList.contains("overflow-hidden")).toBe(false);
		const table = screen.getByRole("radio", { name: "Table" });
		const board = screen.getByRole("radio", { name: "Board" });
		// Each item draws its own border, and the end items round the outer
		// corners, so the group clips nothing. Base UI puts a hidden input after
		// each item, so the end items are the first and last of their type.
		for (const item of [table, board]) {
			expectClasses(
				item,
				"h-7 border-y border-border first-of-type:rounded-l-md first-of-type:border-l last-of-type:rounded-r-md last-of-type:border-r",
			);
		}
		expect(table.matches(":first-of-type")).toBe(true);
		expect(board.matches(":last-of-type")).toBe(true);
		expect(table.getAttribute("aria-checked")).toBe("true");
		expectClasses(table, "bg-bg text-fg");
		expectFocusRing(table);
		expect(board.getAttribute("aria-checked")).toBe("false");
		expectClasses(board, "text-fg-muted");
		table.focus();
		await user.keyboard("{ArrowRight}");
		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(onValueChange.mock.calls[0]![0]).toBe("Board");
	});

	// An item is 28 px tall with a 1 px border. The layer grows its height to
	// 44 px on a coarse pointer. The min-width grows its drawn width to 28 px
	// and 44 px, so the layer never covers the item beside it.
	test("every item carries the hit-area layer and the min-widths", () => {
		render(
			<Segmented
				label="View"
				options={[
					{ value: "Table", label: "Table" },
					{ value: "Board", label: "Board" },
				]}
				value="Table"
				onValueChange={() => {}}
			/>,
		);
		for (const item of screen.getAllByRole("radio")) {
			expectHitArea(item, "segment28");
			expectClasses(item, "min-w-7 pointer-coarse:min-w-11");
		}
	});
});
