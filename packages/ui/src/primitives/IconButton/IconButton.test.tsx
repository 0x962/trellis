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

	// The primary variant is the chevron half of a split button beside a
	// primary Button, so it carries the same accent fill. cx joins classes
	// with no merge, so the surface fill of the default variant must be absent.
	test("the primary variant fills with the accent and carries no surface fill", () => {
		render(<IconButton label="Options" icon={<RefreshCw />} variant="primary" />);
		const button = screen.getByRole("button", { name: "Options" });
		expectClasses(button, "bg-accent border-accent text-on-accent");
		expect(button.classList.contains("bg-surface")).toBe(false);
		expect(button.classList.contains("text-fg")).toBe(false);
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
});
