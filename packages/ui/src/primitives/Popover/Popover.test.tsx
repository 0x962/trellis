import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses } from "../../../test/classes";
import { Button } from "../Button/Button";
import { Popover } from "./Popover";

const setup = () => {
	const user = userEvent.setup();
	render(
		<>
			<Popover trigger={<Button>Display</Button>}>
				<p>Display options</p>
			</Popover>
			<button type="button">Elsewhere</button>
		</>,
	);
	return { user, trigger: screen.getByRole("button", { name: "Display" }) };
};

describe("Popover", () => {
	test("click opens a themed popup and sets aria-expanded", async () => {
		const { user, trigger } = setup();
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		await user.click(trigger);
		const popup = await screen.findByRole("dialog");
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		expect(popup.textContent).toContain("Display options");
		expectClasses(popup, "bg-elevated border-border rounded-lg shadow-md p-2 duration-popover");
	});

	test("Escape and outside click close the popover", async () => {
		const { user, trigger } = setup();
		await user.click(trigger);
		await screen.findByRole("dialog");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(document.activeElement).toBe(trigger);

		await user.click(trigger);
		await screen.findByRole("dialog");
		await user.click(screen.getByRole("button", { name: "Elsewhere" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});
});
