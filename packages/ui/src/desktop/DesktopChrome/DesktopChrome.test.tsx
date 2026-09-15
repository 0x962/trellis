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

test("the desktop keeps interactive content without a separate title strip", async () => {
	const click = mock();
	render(
		<DesktopChrome enabled>
			<button type="button" onClick={click}>
				Collapse sidebar
			</button>
		</DesktopChrome>,
	);
	const button = screen.getByRole("button");
	expect(screen.queryByText("Trellis")).toBeNull();
	expect(document.querySelector("[data-desktop-titlebar]")).toBeNull();
	expect(button.closest("[data-desktop-content]")).not.toBeNull();
	await userEvent.setup().click(button);
	expect(click).toHaveBeenCalledTimes(1);
});
