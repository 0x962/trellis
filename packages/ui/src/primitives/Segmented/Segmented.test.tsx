import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses } from "../../../test/classes";
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
		expectClasses(group, "border-border rounded-md overflow-hidden");
		const table = screen.getByRole("radio", { name: "Table" });
		const board = screen.getByRole("radio", { name: "Board" });
		expect(table.getAttribute("aria-checked")).toBe("true");
		expectClasses(table, "bg-bg text-fg");
		expect(board.getAttribute("aria-checked")).toBe("false");
		expectClasses(board, "text-fg-muted");
		table.focus();
		await user.keyboard("{ArrowRight}");
		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(onValueChange.mock.calls[0]![0]).toBe("Board");
	});
});
