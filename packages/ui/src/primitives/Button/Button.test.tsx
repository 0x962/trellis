import { describe, expect, mock, test } from "bun:test";
import { Check } from "@phosphor-icons/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses, expectHitArea } from "../../../test/classes";
import { Kbd } from "../Kbd";
import { Button } from "./Button";

describe("Button", () => {
	test("renders a button with its name and the default variant classes", () => {
		render(<Button>Approve</Button>);
		const button = screen.getByRole("button", { name: "Approve" });
		expectClasses(button, "h-7 rounded-md text-sm font-medium bg-control border-border-strong text-fg");
	});

	// Default steps through the control ramp, and quiet takes a wash of the
	// text color, so both hovers read on the page and on a surface.
	test("default and quiet hover and press one step toward the text color", () => {
		render(
			<>
				<Button>Default</Button>
				<Button variant="quiet">Quiet</Button>
			</>,
		);
		expectClasses(
			screen.getByRole("button", { name: "Default" }),
			"enabled:hover:bg-control-hover enabled:active:bg-control-active",
		);
		expectClasses(screen.getByRole("button", { name: "Quiet" }), "enabled:hover:bg-fg/6 enabled:active:bg-fg/10");
	});

	test("every variant has a pressed look", () => {
		const variants = ["primary", "default", "quiet", "danger", "danger-soft"] as const;
		render(
			variants.map((variant) => (
				<Button key={variant} variant={variant}>
					{variant}
				</Button>
			)),
		);
		for (const variant of variants) {
			const button = screen.getByRole("button", { name: variant });
			expect(`${variant}: ${/(^| )enabled:active:/.test(button.className)}`).toBe(`${variant}: true`);
		}
	});

	test("variant and size props map to token classes", () => {
		render(
			<>
				<Button variant="primary">Primary</Button>
				<Button variant="quiet">Quiet</Button>
				<Button variant="danger">Danger</Button>
				<Button variant="danger-soft">Delete</Button>
				<Button size="sm">Small</Button>
				<Button size="md">Medium</Button>
			</>,
		);
		expectClasses(screen.getByRole("button", { name: "Primary" }), "metal enabled:active:metal-pressed");
		expectClasses(screen.getByRole("button", { name: "Quiet" }), "border-transparent text-fg-muted");
		expectClasses(screen.getByRole("button", { name: "Danger" }), "bg-danger");
		expectClasses(
			screen.getByRole("button", { name: "Delete" }),
			"bg-control border-border-strong text-danger enabled:hover:bg-danger-soft enabled:hover:border-danger",
		);
		expectClasses(screen.getByRole("button", { name: "Small" }), "h-7 px-2.5 text-sm");
		expectClasses(screen.getByRole("button", { name: "Medium" }), "h-8 px-3 text-base");
	});

	// Size sm is drawn 28 px tall and size md 32 px, both with a 1 px border
	// and at least 28 px wide. The hit-area token reaches 28 px on a desktop
	// pointer through its layer, and draws a 44 px box on a coarse pointer.
	test("both sizes carry the hit-area layer and the 28 px min-width", () => {
		render(
			<>
				<Button size="md">Medium</Button>
				<Button size="sm">Small</Button>
			</>,
		);
		expectHitArea(screen.getByRole("button", { name: "Medium" }), "box32Bordered");
		expectHitArea(screen.getByRole("button", { name: "Small" }), "box28Bordered");
		expectClasses(screen.getByRole("button", { name: "Medium" }), "min-w-7");
		expectClasses(screen.getByRole("button", { name: "Small" }), "min-w-7");
	});

	// A disabled control must not read as an action, so every variant with a
	// ground draws the same surface with a faint label, and quiet keeps no
	// ground and takes the faint label. No variant fades through opacity.
	test("every disabled variant has one look: the surface and a faint label, with no opacity", () => {
		render(
			<>
				<Button variant="primary" disabled>
					Create
				</Button>
				<Button variant="default" disabled>
					Cancel
				</Button>
				<Button variant="danger" disabled>
					Delete
				</Button>
				<Button variant="danger-soft" disabled>
					Keep mine
				</Button>
				<Button variant="quiet" disabled>
					Move
				</Button>
			</>,
		);
		for (const name of ["Create", "Cancel", "Delete", "Keep mine"]) {
			expectClasses(
				screen.getByRole("button", { name }),
				"disabled:bg-surface disabled:border-border disabled:text-fg-faint",
			);
		}
		expectClasses(screen.getByRole("button", { name: "Move" }), "disabled:text-fg-faint");
		for (const button of screen.getAllByRole("button")) {
			expect(button.className).not.toMatch(/opacity/);
		}
	});

	// The cap sits 4 px from the top at sm and 6 px at md, so the left padding
	// matches and the cap's corner follows the button's corner.
	test("a shortcut button pulls its left padding in to the cap's top inset", () => {
		render(
			<>
				<Button kbd="a">Small</Button>
				<Button size="md" kbd="b">
					Medium
				</Button>
			</>,
		);
		expectClasses(screen.getByRole("button", { name: "Small a" }), "pl-1 pr-2.5");
		expectClasses(screen.getByRole("button", { name: "Medium b" }), "pl-1.5 pr-3");
	});

	test("both segments of a shortcut button activate the same action", async () => {
		const user = userEvent.setup();
		const onClick = mock();
		render(
			<Button variant="primary" kbd="⌘↵" onClick={onClick}>
				Create
			</Button>,
		);
		const button = screen.getByRole("button", { name: "Create ⌘↵" });
		const shortcut = button.querySelector("kbd")!;
		const label = screen.getByText("Create");
		expect(shortcut.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(screen.getAllByRole("button")).toHaveLength(1);
		await user.click(shortcut);
		await user.click(label);
		expect(onClick).toHaveBeenCalledTimes(2);
	});

	test("Enter and Space activate the button", async () => {
		const user = userEvent.setup();
		const onClick = mock();
		render(<Button onClick={onClick}>Approve</Button>);
		screen.getByRole("button", { name: "Approve" }).focus();
		await user.keyboard("{Enter}");
		expect(onClick).toHaveBeenCalledTimes(1);
		await user.keyboard(" ");
		expect(onClick).toHaveBeenCalledTimes(2);
	});

	test("disabled blocks activation and carries the disabled classes", async () => {
		const user = userEvent.setup();
		const onClick = mock();
		render(
			<Button disabled onClick={onClick}>
				Approve
			</Button>,
		);
		const button = screen.getByRole("button", { name: "Approve" });
		expect(button.hasAttribute("disabled")).toBe(true);
		await user.click(button);
		button.focus();
		await user.keyboard("{Enter} ");
		expect(onClick).not.toHaveBeenCalled();
		expectClasses(button, "disabled:bg-surface disabled:text-fg-faint enabled:hover:bg-control-hover");
		// The pointer still reaches a disabled button, so base.css can show the
		// not-allowed cursor. Every hover is gated on :enabled instead.
		expect(button.className).not.toMatch(/(^| )hover:/);
	});

	test("exposes the focus-visible outline classes", () => {
		render(<Button>Approve</Button>);
		expectClasses(
			screen.getByRole("button", { name: "Approve" }),
			"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
		);
	});

	// TRL-34. One key cap style serves the whole app. The cap inside a button
	// is the Kbd primitive, so a primary button, a secondary button, and a
	// bare cap in a row all draw the same element.
	test("the shortcut is the Kbd primitive, with the same classes in every variant", () => {
		render(
			<>
				<Kbd>⌘K</Kbd>
				<Button variant="primary" kbd="a">
					Primary
				</Button>
				<Button variant="default" kbd="b">
					Secondary
				</Button>
				<Button variant="quiet" size="md" kbd="c">
					Quiet
				</Button>
			</>,
		);
		const bare = screen.getByText("⌘K");
		for (const [name, cap] of [
			["Primary", "a"],
			["Secondary", "b"],
			["Quiet", "c"],
		]) {
			const inside = screen.getByRole("button", { name: `${name} ${cap}` }).querySelector("kbd")!;
			expect(inside.tagName).toBe("KBD");
			expect(`${name}: ${inside.className}`).toBe(`${name}: ${bare.className} shrink-0`);
		}
	});

	// A quiet button with a shortcut kept its own border and surface, so its
	// cap read as a third style. It now looks like every other quiet button.
	test("a quiet button with a shortcut keeps the quiet variant classes", () => {
		render(
			<Button variant="quiet" kbd="r">
				Send back
			</Button>,
		);
		expectClasses(
			screen.getByRole("button", { name: "Send back r" }),
			"bg-transparent border-transparent text-fg-muted",
		);
	});

	test("renders the shortcut segment before the icon and label", () => {
		render(
			<Button icon={<Check />} kbd="a">
				Approve
			</Button>,
		);
		const button = screen.getByRole("button", { name: "Approve a" });
		const icon = button.querySelector("svg")!;
		expect(icon.getAttribute("aria-hidden")).toBe("true");
		const kbd = button.querySelector("kbd")!;
		expect(kbd.textContent).toBe("a");
		const text = screen.getByText("Approve");
		expect(icon.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(kbd.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});

test("start alignment applies to the icon and label", () => {
	render(
		<Button align="start" icon={<Check />}>
			New agent
		</Button>,
	);
	const label = screen.getByRole("button", { name: "New agent" }).querySelector(":scope > span")!;
	expect(label.classList.contains("justify-start")).toBe(true);
	expect(label.classList.contains("justify-center")).toBe(false);
});
