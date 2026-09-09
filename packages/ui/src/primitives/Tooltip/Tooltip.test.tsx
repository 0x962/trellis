import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Check } from "lucide-react";
import { expectClasses } from "../../../test/classes";
import { IconButton } from "../IconButton/IconButton";
import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
	test("hover and focus show a tooltip that describes the trigger", async () => {
		const user = userEvent.setup();
		render(
			<>
				<Tooltip content="Approve">
					<IconButton label="Approve" icon={<Check />} />
				</Tooltip>
				<button type="button">Other</button>
			</>,
		);
		const trigger = screen.getByRole("button", { name: "Approve" });

		await user.hover(trigger);
		const hovered = await screen.findByRole("tooltip", {}, { timeout: 3000 });
		expect(hovered.textContent).toBe("Approve");
		expect(trigger.getAttribute("aria-describedby")).toBe(hovered.id);
		expectClasses(hovered, "bg-fg text-bg text-xs rounded-sm");
		await user.unhover(trigger);
		await user.click(screen.getByRole("button", { name: "Other" }));
		await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull(), { timeout: 3000 });

		await user.keyboard("{Shift>}{Tab}{/Shift}");
		expect(document.activeElement).toBe(trigger);
		const focused = await screen.findByRole("tooltip", {}, { timeout: 3000 });
		expect(focused.textContent).toBe("Approve");
		expect(trigger.getAttribute("aria-describedby")).toBe(focused.id);
	});
});
