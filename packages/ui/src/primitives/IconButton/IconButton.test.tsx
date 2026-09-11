import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefreshCw } from "lucide-react";
import { expectClasses, expectHitArea } from "../../../test/classes";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
	test("square button named by its label, keyboard operable, reflects disabled", async () => {
		const user = userEvent.setup();
		const onClick = mock();
		const { rerender } = render(<IconButton label="Refresh" icon={<RefreshCw />} onClick={onClick} />);
		const button = screen.getByRole("button", { name: "Refresh" });
		expect(button.getAttribute("aria-label")).toBe("Refresh");
		expectClasses(button, "size-7 rounded-md");
		expectClasses(button, "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2");
		expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
		button.focus();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		expect(onClick).toHaveBeenCalledTimes(2);

		rerender(<IconButton label="Refresh" icon={<RefreshCw />} onClick={onClick} disabled />);
		expect(button.hasAttribute("disabled")).toBe(true);
		await user.click(button);
		expect(onClick).toHaveBeenCalledTimes(2);
	});

	// Both halves of a primary split button share the same fill and border.
	test("the primary variant uses the card surface and a strong border", () => {
		render(<IconButton label="Options" icon={<RefreshCw />} variant="primary" />);
		const button = screen.getByRole("button", { name: "Options" });
		expectClasses(button, "bg-surface border-border-strong text-fg");
		expect(button.classList.contains("bg-accent")).toBe(false);
		expect(button.classList.contains("text-on-accent")).toBe(false);
	});

	// Size md is drawn 28 px square and size sm 24 px, both with a 1 px border.
	// Both reach 28 px on a desktop pointer and 44 px on a coarse pointer in
	// both axes through the hit-area layer.
	test("both sizes carry the hit-area layer", () => {
		render(
			<>
				<IconButton label="Medium" icon={<RefreshCw />} />
				<IconButton label="Small" size="sm" icon={<RefreshCw />} />
			</>,
		);
		expectHitArea(screen.getByRole("button", { name: "Medium" }), "box28Bordered");
		expectHitArea(screen.getByRole("button", { name: "Small" }), "box24Bordered");
	});

	// An IconButton next to a Button in a split control takes the same fill,
	// so a caller never paints a variant through className.
	test("the variants match the Button variant set", () => {
		render(
			<>
				<IconButton label="Primary" variant="primary" icon={<RefreshCw />} />
				<IconButton label="Default" variant="default" icon={<RefreshCw />} />
				<IconButton label="Quiet" icon={<RefreshCw />} />
				<IconButton label="Danger" variant="danger" icon={<RefreshCw />} />
			</>,
		);
		expectClasses(screen.getByRole("button", { name: "Primary" }), "bg-surface border-border-strong text-fg");
		expectClasses(screen.getByRole("button", { name: "Default" }), "bg-surface border-border text-fg");
		expectClasses(screen.getByRole("button", { name: "Quiet" }), "bg-transparent border-transparent text-fg-muted");
		expectClasses(screen.getByRole("button", { name: "Danger" }), "bg-danger border-danger text-on-accent");
	});
});
