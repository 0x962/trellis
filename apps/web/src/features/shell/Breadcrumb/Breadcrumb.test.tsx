import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { Breadcrumb } from "./Breadcrumb";

beforeEach(() => localStorage.clear());

// TRL-29. The topbar gives the title slot `min-w-0` and the view switch
// `shrink-0`. A box between the slot and the heading with the default
// `min-width: auto` holds the heading at its full width, and the opaque
// switch then paints over the last glyph. Every box on that path carries
// `min-w-0`, so the heading truncates first.
describe("features/shell/Breadcrumb", () => {
	test("every box between the topbar slot and the heading can shrink", () => {
		renderWithProviders(<Breadcrumb path="CDE" current="Long project name for a narrow phone bar" />, {
			path: "/all/table",
			actor: "dana",
		});
		const heading = screen.getByRole("heading", { level: 1 });
		expect(heading.className).toContain("truncate");
		const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
		for (let box = heading.parentElement!; box !== nav.parentElement; box = box.parentElement!) {
			expect(box.className, box.tagName).toContain("min-w-0");
		}
	});

	test("the project key beside the heading keeps its width", () => {
		renderWithProviders(<Breadcrumb path="CDE" current="Cloud Desktop" />, { path: "/all/table", actor: "dana" });
		const key = screen.getByText("CDE");
		expect(key.className).toContain("shrink-0");
	});

	// TRL-45. The 390 px bar held a toggle, the key chip, the title, the view
	// switch, and New ticket, and the title truncated to one glyph. The chip
	// leaves below 640 px and the heading takes its width. A path with a
	// parent keeps its chip, because that chip is the link to the root
	// project.
	test("the project key beside the heading leaves below 640 px and the link chip stays", () => {
		const { unmount } = renderWithProviders(<Breadcrumb path="CDE" current="Cloud Desktop" />, {
			path: "/all/table",
			actor: "dana",
		});
		expect(screen.getByText("CDE").className).toContain("max-sm:hidden");
		unmount();
		renderWithProviders(<Breadcrumb path="CDE.web" current="Web" />, { path: "/all/table", actor: "dana" });
		expect(screen.getByText("CDE").className).not.toContain("max-sm:hidden");
	});
});
