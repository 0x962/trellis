import { beforeEach, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";
import { createUiStore, useUiStore } from "../../../stores/uiStore";

beforeEach(() => {
	localStorage.clear();
	useUiStore.setState(createUiStore().getState());
});

// The page title of every screen. The topbar holds it, so the rule that
// binds every title to one size token belongs here.
const webSource = join(import.meta.dir, "../../..");

const sizeToken = /\btext-(?:2xl|xl|lg|md|base|sm|xs)\b/;

// Each `<h1>` opening tag in the web source, with the size token of its
// class list. A tag with no size token reports `none`.
const pageHeadings = async () => {
	const files = readdirSync(webSource, { recursive: true, encoding: "utf8" }).filter(
		(file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"),
	);
	const headings: string[] = [];
	for (const file of files) {
		const source = await Bun.file(join(webSource, file)).text();
		for (const tag of source.match(/<h1\b[^>]*>/g) ?? []) {
			const className = /className="([^"]*)"/.exec(tag)?.[1] ?? "";
			headings.push(`${file}: ${sizeToken.exec(className)?.[0] ?? "none"}`);
		}
	}
	return headings;
};

describe("features/shell/Topbar", () => {
	// MB-A. A phone has no room for the 240 px sidebar. The topbar leads
	// with a button that opens the sidebar in a sheet from the left, and a
	// navigation closes the sheet.
	test("on a phone the topbar opens the sidebar in a sheet that closes on navigation", async () => {
		mockMatchMedia(true);
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/all/table", actor: "dana" });
		const header = (await screen.findByRole("heading", { name: "All tickets" })).closest("header")!;
		for (const name of ["max-md:h-12", "max-md:px-4"]) expect(header.classList.contains(name)).toBe(true);
		const open = within(header).getByRole("button", { name: "Open the sidebar" });
		expect(header.firstElementChild).toBe(open);
		await user.click(open);
		const sheet = await screen.findByRole("dialog", { name: "Navigation" });
		expect(sheet.style.width).toBe("280px");
		expect(sheet.className).toMatch(/\bduration-popover\b/);
		await user.click(within(sheet).getByRole("link", { name: /Needs you/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull());
	});

	// MB-A. The desktop sidebar leaves the layout below 768 px.
	test("the desktop sidebar hides below 768 px", async () => {
		mockMatchMedia(false);
		renderApp({ path: "/all/table", actor: "dana" });
		const aside = await screen.findByRole("complementary", { name: "Sidebar" });
		expect(aside.classList.contains("max-md:hidden")).toBe(true);
		const header = (await screen.findByRole("heading", { name: "All tickets" })).closest("header")!;
		expect(within(header).queryByRole("button", { name: "Open the sidebar" })).toBeNull();
	});

	// TRL-42. The audit measured ten page titles at 16 px and four at 14 px.
	// One size token carries every page title, so a new page starts at the
	// size the other pages already use.
	test("every page title carries one size token", async () => {
		const headings = await pageHeadings();
		expect(headings.length).toBeGreaterThanOrEqual(14);
		expect(headings.filter((heading) => !heading.endsWith(": text-lg"))).toEqual([]);
	});
});
