import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Check } from "lucide-react";
import { expectClasses, expectHitArea } from "../../../test/classes";
import { Button } from "./Button";

describe("Button", () => {
	test("renders a button with its name and the default variant classes", () => {
		render(<Button>Approve</Button>);
		const button = screen.getByRole("button", { name: "Approve" });
		expectClasses(button, "h-7 rounded-md text-sm font-medium bg-surface border-border text-fg");
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
		expectClasses(screen.getByRole("button", { name: "Primary" }), "bg-accent border-accent");
		expectClasses(screen.getByRole("button", { name: "Quiet" }), "border-transparent text-fg-muted");
		expectClasses(screen.getByRole("button", { name: "Danger" }), "bg-danger");
		expectClasses(
			screen.getByRole("button", { name: "Delete" }),
			"bg-surface border-border text-danger enabled:hover:bg-danger-soft enabled:hover:border-danger",
		);
		expectClasses(screen.getByRole("button", { name: "Small" }), "h-7 px-2.5 text-sm");
		expectClasses(screen.getByRole("button", { name: "Medium" }), "h-8 px-3 text-base");
	});

	// Size sm is drawn 28 px tall and size md 32 px, both with a 1 px border
	// and at least 28 px wide. Both reach 28 px on a desktop pointer and 44 px
	// on a coarse pointer in both axes through the hit-area layer.
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

	// A disabled fill must not read as an action, so primary and danger lose
	// their fill and draw the quiet surface instead of a faded color.
	test("a disabled primary and a disabled danger draw the surface with faint text and no opacity", () => {
		render(
			<>
				<Button variant="primary" disabled>
					Create
				</Button>
				<Button variant="danger" disabled>
					Delete
				</Button>
				<Button disabled>Cancel</Button>
			</>,
		);
		for (const name of ["Create", "Delete"]) {
			const button = screen.getByRole("button", { name });
			expectClasses(button, "disabled:bg-surface disabled:border-border disabled:text-fg-faint");
			expect(button.className).not.toMatch(/disabled:opacity-50/);
		}
		expectClasses(screen.getByRole("button", { name: "Cancel" }), "disabled:opacity-50");
	});

	// One Kbd style serves every button, so a primary button prints the same
	// key cap as a default one.
	test("the Kbd inside a primary button uses the one Kbd style", () => {
		render(
			<Button variant="primary" kbd="⌘↵">
				Create
			</Button>,
		);
		const kbd = screen.getByRole("button", { name: /Create/ }).querySelector("kbd")!;
		expectClasses(kbd, "border-border-strong bg-surface text-fg-muted text-xs");
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
		expectClasses(button, "disabled:opacity-50 enabled:hover:bg-bg");
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

	test("renders a leading icon and a trailing Kbd", () => {
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
		expect(text.compareDocumentPosition(kbd) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
