import { describe, expect, mock, test } from "bun:test";
import { Funnel } from "@phosphor-icons/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses, expectHitArea } from "../../../test/classes";
import { Chip } from "./Chip";

describe("Chip", () => {
	test("filter chip with optional remove button", async () => {
		const user = userEvent.setup();
		const onRemove = mock();
		const { rerender } = render(<Chip icon={<Funnel />} label="Status" value="In Progress" onRemove={onRemove} />);
		const label = screen.getByText("Status");
		const chip = screen.getByText("In Progress").parentElement!;
		expect(chip.contains(label)).toBe(true);
		expectClasses(chip, "h-5 rounded-sm border-border bg-surface text-xs text-fg-muted");
		expectClasses(label, "text-fg font-medium");
		const remove = screen.getByRole("button", { name: "Remove Status" });
		// The glyph box is 16 px; the ::before layer extends the hit area by 6 px
		// on every side to the 28 px desktop minimum.
		expectClasses(remove, "size-4 relative before:absolute before:-inset-1.5");
		expectHitArea(remove, "box16");
		await user.click(remove);
		expect(onRemove).toHaveBeenCalledTimes(1);

		rerender(<Chip icon={<Funnel />} label="Status" value="In Progress" />);
		expect(screen.queryByRole("button")).toBeNull();
	});
});
