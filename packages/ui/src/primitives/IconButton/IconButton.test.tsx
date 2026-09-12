import { describe, expect, mock, test } from "bun:test";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses, expectHitArea } from "../../../test/classes";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
	test("square button named by its label, keyboard operable, reflects disabled", async () => {
		const user = userEvent.setup();
		const onClick = mock();
		const { rerender } = render(<IconButton label="Refresh" icon={<ArrowsClockwise />} onClick={onClick} />);
		const button = screen.getByRole("button", { name: "Refresh" });
		expect(button.getAttribute("aria-label")).toBe("Refresh");
		expectClasses(button, "size-7 rounded-round");
		expectClasses(button, "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2");
		expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
		button.focus();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		expect(onClick).toHaveBeenCalledTimes(2);

		rerender(<IconButton label="Refresh" icon={<ArrowsClockwise />} onClick={onClick} disabled />);
		expect(button.hasAttribute("disabled")).toBe(true);
		await user.click(button);
		expect(onClick).toHaveBeenCalledTimes(2);
	});

	// Both halves of a primary split button share the same silver fill.
	test("the primary variant is the silver metal", () => {
		render(<IconButton label="Options" icon={<ArrowsClockwise />} variant="primary" />);
		const button = screen.getByRole("button", { name: "Options" });
		expectClasses(button, "metal enabled:active:metal-pressed");
		expect(button.classList.contains("bg-accent")).toBe(false);
		expect(button.classList.contains("text-on-accent")).toBe(false);
	});

	// Sizes sm and md are as tall as Button sm (28 px) and Button md (32 px),
	// and xs is 24 px. Every size reaches 28 px on a desktop pointer and
	// 44 px on a coarse pointer through the hit-area layer.
	test("each size matches the Button height of the same name and carries the hit-area layer", () => {
		render(
			<>
				<IconButton label="Default" icon={<ArrowsClockwise />} />
				<IconButton label="Extra small" size="xs" icon={<ArrowsClockwise />} />
				<IconButton label="Small" size="sm" icon={<ArrowsClockwise />} />
				<IconButton label="Medium" size="md" icon={<ArrowsClockwise />} />
			</>,
		);
		expectClasses(screen.getByRole("button", { name: "Default" }), "size-7");
		expectClasses(screen.getByRole("button", { name: "Extra small" }), "size-6");
		expectClasses(screen.getByRole("button", { name: "Small" }), "size-7");
		expectClasses(screen.getByRole("button", { name: "Medium" }), "size-8");
		expectHitArea(screen.getByRole("button", { name: "Extra small" }), "box24Bordered");
		expectHitArea(screen.getByRole("button", { name: "Small" }), "box28Bordered");
		expectHitArea(screen.getByRole("button", { name: "Medium" }), "box32Bordered");
	});

	// A toggle reports its state to assistive technology and draws it: an on
	// toggle takes the accent ring and fill, and an off toggle keeps its variant.
	test("a toggle sets aria-pressed and takes the accent ring while it is on", () => {
		render(
			<>
				<IconButton label="On" icon={<ArrowsClockwise />} variant="default" pressed />
				<IconButton label="Off" icon={<ArrowsClockwise />} variant="default" pressed={false} />
				<IconButton label="Plain" icon={<ArrowsClockwise />} />
			</>,
		);
		const on = screen.getByRole("button", { name: "On" });
		const off = screen.getByRole("button", { name: "Off" });
		expect(on.getAttribute("aria-pressed")).toBe("true");
		expect(off.getAttribute("aria-pressed")).toBe("false");
		expect(screen.getByRole("button", { name: "Plain" }).hasAttribute("aria-pressed")).toBe(false);
		expectClasses(on, "rounded-round bg-accent-soft border-accent text-fg");
		expectClasses(off, "rounded-round bg-control border-border-strong");
	});

	// An IconButton next to a Button in a split control takes the same fill,
	// so a caller never paints a variant through className.
	test("the variants match the Button variant set", () => {
		render(
			<>
				<IconButton label="Primary" variant="primary" icon={<ArrowsClockwise />} />
				<IconButton label="Default" variant="default" icon={<ArrowsClockwise />} />
				<IconButton label="Quiet" icon={<ArrowsClockwise />} />
				<IconButton label="Danger" variant="danger" icon={<ArrowsClockwise />} />
			</>,
		);
		expectClasses(screen.getByRole("button", { name: "Primary" }), "metal");
		expectClasses(screen.getByRole("button", { name: "Default" }), "bg-control border-border-strong text-fg");
		expectClasses(screen.getByRole("button", { name: "Quiet" }), "bg-transparent border-transparent text-fg-muted");
		expectClasses(screen.getByRole("button", { name: "Danger" }), "bg-danger border-danger text-on-accent");
	});
});
