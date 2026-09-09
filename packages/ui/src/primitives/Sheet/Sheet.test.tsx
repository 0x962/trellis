import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses } from "../../../test/classes";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
	test("right-side sheet dialog with peek duration, Escape closes", async () => {
		const user = userEvent.setup();
		const onOpenChange = mock();
		render(
			<Sheet open side="right" title="CDE-43" onOpenChange={onOpenChange}>
				<p>Merge upstream 1.27</p>
			</Sheet>,
		);
		const panel = screen.getByRole("dialog", { name: "CDE-43" });
		expectClasses(panel, "fixed inset-y-0 right-0 bg-surface border-l border-border duration-peek");
		// The plan turns a slide into a fade under reduced motion.
		expectClasses(
			panel,
			"motion-reduce:transition-opacity motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-ending-style:opacity-0",
		);
		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledTimes(1);
		expect(onOpenChange.mock.calls[0]![0]).toBe(false);
	});
});
