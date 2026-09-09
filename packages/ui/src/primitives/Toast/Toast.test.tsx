import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Toaster, toast } from "./Toast";

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
		expectClasses(shell, "bg-elevated border-border rounded-lg shadow-md text-sm");
	});

	test("the Start-with-agent toast shows the command in mono", async () => {
		render(<Toaster />);
		act(() => {
			toast.command({ title: "Started with claude-code", command: "trellis move CDE-1 in-progress" });
		});
		const title = await screen.findByText("Started with claude-code");
		const shell = title.closest("[data-sonner-toast]")!;
		expect(shell.querySelector("svg.text-success")).not.toBeNull();
		const pre = shell.querySelector("pre")!;
		expect(pre.textContent).toBe("trellis move CDE-1 in-progress");
		expectClasses(pre, "font-mono text-xs bg-bg border-border rounded-sm");
	});
});
