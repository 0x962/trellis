import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Filter } from "lucide-react";
import { expectClasses } from "../../../test/classes";
import { Chip } from "./Chip";

describe("Chip", () => {
	test("filter chip with optional remove button", async () => {
		const user = userEvent.setup();
		const onRemove = mock();
		const { rerender } = render(<Chip icon={<Filter />} label="Status" value="In Progress" onRemove={onRemove} />);
		const label = screen.getByText("Status");
		const chip = screen.getByText("In Progress").parentElement!;
		expect(chip.contains(label)).toBe(true);
		expectClasses(chip, "h-5 rounded-sm border-border bg-surface text-xs text-fg-muted");
		expectClasses(label, "text-fg font-medium");
		await user.click(screen.getByRole("button", { name: "Remove Status" }));
		expect(onRemove).toHaveBeenCalledTimes(1);

		rerender(<Chip icon={<Filter />} label="Status" value="In Progress" />);
		expect(screen.queryByRole("button")).toBeNull();
	});
});
