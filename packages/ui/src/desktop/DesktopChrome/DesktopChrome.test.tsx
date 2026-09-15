import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopChrome } from "./DesktopChrome.tsx";

test("the browser renders its content without a desktop title strip", () => {
	render(
		<DesktopChrome enabled={false}>
			<main>Tickets</main>
		</DesktopChrome>,
	);
	expect(screen.queryByText("Trellis")).toBeNull();
	expect(screen.getByRole("main").textContent).toBe("Tickets");
});

test("the desktop separates its drag strip from interactive content", async () => {
	const click = mock();
	render(
		<DesktopChrome enabled>
			<button type="button" onClick={click}>
				Collapse sidebar
			</button>
		</DesktopChrome>,
	);
	const title = screen.getByText("Trellis");
	const button = screen.getByRole("button");
	expect(title.textContent).toBe("Trellis");
	expect(title.contains(button)).toBe(false);
	expect(button.closest("[data-desktop-content]")).not.toBeNull();
	await userEvent.setup().click(button);
	expect(click).toHaveBeenCalledTimes(1);
});
