import { beforeEach, describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../test/media";
import { Gallery } from "./Gallery";

const primitives = [
	"Button",
	"IconButton",
	"Input",
	"Textarea",
	"Select",
	"Popover",
	"Menu",
	"Dialog",
	"Sheet",
	"Tooltip",
	"Toast",
	"Tabs",
	"Segmented",
	"Checkbox",
	"Switch",
	"Badge",
	"Chip",
	"Avatar",
	"Kbd",
	"Skeleton",
	"ScrollArea",
	"Separator",
	"EmptyState",
	"Command",
];

const domain = ["StatusIcon", "PriorityIcon", "CheckRibbon", "ActorChip", "TicketId"];

// The section a heading introduces: its closest `section` ancestor.
const section = (name: string) => screen.getByRole("heading", { name }).closest("section")!;

describe("Gallery", () => {
	beforeEach(() => {
		mockMatchMedia(false);
		localStorage.clear();
		document.documentElement.removeAttribute("data-theme");
	});

	test("the gallery has a section for every primitive and domain component", () => {
		render(<Gallery />);
		for (const name of [...primitives, ...domain]) {
			expect(section(name)).not.toBeNull();
		}
		const buttons = within(section("Button")).getAllByRole("button");
		const withClasses = (classes: string) =>
			buttons.filter((button) => classes.split(" ").every((name) => button.classList.contains(name)));
		expect(withClasses("bg-accent border-accent").length).toBeGreaterThan(0);
		expect(withClasses("bg-surface border-border").length).toBeGreaterThan(0);
		expect(withClasses("border-transparent text-fg-muted").length).toBeGreaterThan(0);
		expect(withClasses("bg-danger").length).toBeGreaterThan(0);
		expect(buttons.filter((button) => button.hasAttribute("disabled")).length).toBeGreaterThan(0);
		expect(withClasses("h-6 text-xs").length).toBeGreaterThan(0);
		expect(withClasses("h-7 text-sm").length).toBeGreaterThan(0);
	});

	test("the composition section reproduces the mockup rows with the real components", () => {
		render(<Gallery />);
		const row = screen.getByTestId("needs-you-row");
		expect(row.querySelector("[aria-label^='Priority:']")).not.toBeNull();
		const id = Array.from(row.querySelectorAll(".font-mono")).find((element) =>
			/^[A-Z]+-\d+$/.test(element.textContent!),
		);
		expect(id).toBeDefined();
		expect(row.querySelector("svg[data-category]")).not.toBeNull();
		const miniRibbon = row.querySelector("[title$='checks']")!;
		expect(miniRibbon.classList.contains("w-8")).toBe(true);
		expect(row.querySelector("[aria-label$='· agent'] [data-live]")).not.toBeNull();
		within(row).getByRole("button", { name: "Approve a" });

		screen.getByTestId("board-card");

		const pr = screen.getByTestId("pr-row");
		const ribbon = pr.querySelector("[title$='checks']")!;
		expect(ribbon.classList.contains("w-16")).toBe(true);
		expect(within(pr).getByText("· agent")).not.toBeNull();
	});

	test("the gallery theme toggle drives useTheme", async () => {
		const user = userEvent.setup();
		render(<Gallery />);
		const theme = screen.getByRole("radiogroup", { name: "Theme" });
		await user.click(within(theme).getByRole("radio", { name: "Dark" }));
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		await user.click(within(theme).getByRole("radio", { name: "System" }));
		expect(document.documentElement.getAttribute("data-theme")).toBeNull();
	});
});
