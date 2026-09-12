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
			<p>Nothing here</p>
		</>,
	);
	return { user, trigger: screen.getByRole("button", { name: "Display" }) };
};

describe("Popover", () => {
	test("a trigger with a tooltip keeps its popup action", async () => {
		render(
			<Popover trigger={<Button>Reaction</Button>} triggerTooltip="Add a reaction">
				<p>Choices</p>
			</Popover>,
		);
		await userEvent.hover(screen.getByRole("button", { name: "Reaction" }));
		expect((await screen.findByRole("tooltip")).textContent).toBe("Add a reaction");
		await userEvent.click(screen.getByRole("button", { name: "Reaction" }));
		expect((await screen.findByRole("dialog")).textContent).toContain("Choices");
	});
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

	test("an outside click returns focus to the trigger unless it lands on a control", async () => {
		const { user, trigger } = setup();
		await user.click(trigger);
		await screen.findByRole("dialog");
		await user.click(screen.getByText("Nothing here"));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(trigger));

		await user.click(trigger);
		await screen.findByRole("dialog");
		const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
		await user.click(elsewhere);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(elsewhere));
	});

	test("the popup fades under reduced motion instead of scaling", async () => {
		const { user, trigger } = setup();
		await user.click(trigger);
		const popup = await screen.findByRole("dialog");
		expectClasses(popup, "motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100");
	});
});
