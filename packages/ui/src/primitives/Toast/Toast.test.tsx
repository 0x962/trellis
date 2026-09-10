import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Toaster, toast, toastDurations } from "./Toast";

describe("Toast", () => {
	test("toast renders in a status region with token classes", async () => {
		render(<Toaster />);
		act(() => {
			toast("Saved");
		});
		const region = await screen.findByRole("status");
		expect(region.textContent).toContain("Saved");
		const element = await screen.findByText("Saved");
		const shell = element.closest("[data-sonner-toast]")!;
		expectClasses(shell, "bg-elevated border border-border-strong rounded-lg shadow-md text-sm");
	});

	// The toasts sit above the 28 px list footer, so a toast never covers
	// the footer text.
	test("the toaster sits 44 px above the bottom and 16 px from the right", async () => {
		render(<Toaster />);
		act(() => {
			toast("Placed above the footer");
		});
		await screen.findByText("Placed above the footer");
		const toaster = document.querySelector<HTMLElement>("[data-sonner-toaster]")!;
		expect(toaster.style.getPropertyValue("--offset-bottom")).toBe("44px");
		expect(toaster.style.getPropertyValue("--offset-right")).toBe("16px");
	});

	test("a success stays 3 s and an error stays 6 s", () => {
		expect(toastDurations).toEqual({ plain: 3000, success: 3000, error: 6000 });
	});

	test("the Start-with-agent toast shows the command in mono", async () => {
		render(<Toaster />);
		act(() => {
			toast.command({ title: "Started with claude-code", command: "trellis move CDE-1 in-progress" });
		});
		const title = await screen.findByText("Started with claude-code");
		const shell = title.closest("[data-sonner-toast]")!;
		expect(shell.querySelector("svg.text-success")).not.toBeNull();
		expectClasses(title, "text-sm font-medium");
		const command = screen.getByText("trellis move CDE-1 in-progress");
		expectClasses(command, "font-mono text-xs text-fg-muted truncate");
	});
});
