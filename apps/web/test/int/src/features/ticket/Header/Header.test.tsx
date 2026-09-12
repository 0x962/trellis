import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mod } from "../../../../../keyboard";
import { renderTicket } from "../../../../../ticketHost";
import { Header } from "../../../../../../src/features/ticket/Header/Header";

beforeEach(() => localStorage.clear());

const header = () => screen.findByLabelText("Ticket header");

const moreMenuItems = ["Copy brief", "Copy branch name", "Copy link", "Move to project", "Set parent", "Delete"];

const mountPage = () =>
	renderTicket("CDE-42", (ticket) => <Header ticket={ticket} surface="page" />, { path: "/t/CDE-42" });

describe("features/ticket/Header", () => {
	// WT-19. CDE-42 sits in CDE.web under the parent CDE-43.
	test("renders the project path and the parent chip in the breadcrumb", async () => {
		mountPage();
		const element = await header();
		const crumbs = within(element).getByRole("navigation", { name: "Breadcrumb" });
		expect(crumbs.textContent!.replace(/\s+/g, " ")).toMatch(/CDE\s*›\s*web/);
		expect(within(crumbs).getByRole("link", { name: "CDE" }).getAttribute("href")).toBe("/p/CDE");
		expect(within(crumbs).getByRole("link", { name: "web" }).getAttribute("href")).toBe("/p/CDE/web");
		// The chip is the trail that leads here: each identifier opens that
		// ticket, and the title of the parent closes the trail.
		const trail = within(element).getByLabelText("Parent trail");
		expect(within(trail).getByRole("button", { name: "CDE-43" })).toBeDefined();
		expect(trail.textContent).toContain("Merge upstream 1.27");
		expect(trail.querySelector(".truncate")).not.toBeNull();
	});

	// WT-20. A peek stays a peek: the parent opens in the same surface.
	test("the parent chip opens the parent in the same surface", async () => {
		const user = userEvent.setup();
		const { router } = renderTicket("CDE-42", (ticket) => <Header ticket={ticket} surface="peek" />, {
			path: "/p/CDE?peek=CDE-42",
		});
		await user.click(within(await header()).getByRole("button", { name: /CDE-43/ }));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ peek: "CDE-43" }));
		expect(router.state.location.pathname).toBe("/p/CDE");
	});

	test("the peek header shows the ticket ID without a project breadcrumb", async () => {
		renderTicket("CDE-42", (ticket) => <Header ticket={ticket} surface="peek" />, {
			path: "/p/CDE?peek=CDE-42",
		});
		const element = await header();
		expect(within(element).getByText("CDE-42")).toBeDefined();
		expect(within(element).queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
	});

	// WT-21
	test("Copy ID writes the identifier to the clipboard and toasts", async () => {
		const user = userEvent.setup();
		mountPage();
		await user.click(within(await header()).getByRole("button", { name: "Copy ID" }));
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("CDE-42"));
		expect(await screen.findByText(/Copied/)).toBeDefined();
	});

	// The branch name is derived, not shown, so an icon beside Copy ID hands
	// it over without a row of its own.
	test("Copy branch name writes the derived branch to the clipboard", async () => {
		const user = userEvent.setup();
		mountPage();
		await user.click(within(await header()).getByRole("button", { name: "Copy branch name" }));
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("cde-42-restore-fork-pages"));
	});

	// The title area already shows the ticket ID, so Copy ID needs only an icon.
	test("Copy ID is an icon button", async () => {
		mountPage();
		const element = await header();
		expect(within(element).getByRole("button", { name: "Copy ID" }).textContent!.trim()).toBe("");
	});

	// WT-22. Arrow keys walk the items in order; each one takes focus.
	test("the more menu lists every ticket action and takes the keyboard", async () => {
		const user = userEvent.setup();
		mountPage();
		const trigger = within(await header()).getByRole("button", { name: "More actions" });
		trigger.focus();
		await user.keyboard("{Enter}");
		const items = await screen.findAllByRole("menuitem");
		expect(items.map((item) => item.textContent!.trim())).toEqual(moreMenuItems);
		const walked: string[] = [];
		for (let step = 0; step < moreMenuItems.length; step++) {
			const active = document.activeElement as HTMLElement;
			if (active.getAttribute("role") !== "menuitem") await user.keyboard("{ArrowDown}");
			walked.push((document.activeElement as HTMLElement).textContent!.trim());
			await user.keyboard("{ArrowDown}");
		}
		expect(walked).toEqual(moreMenuItems);
	});

	// WT-23. A mod chord fires everywhere on the surface.
	test("the copy shortcuts write the ID, the branch, and the link", async () => {
		userEvent.setup();
		mountPage();
		await header();
		document.body.focus();
		mod("c");
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("CDE-42"));
		mod("c", { shiftKey: true });
		await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("cde-42-restore-fork-pages"));
		mod(".");
		await waitFor(async () => {
			const text = await navigator.clipboard.readText();
			expect(text).toMatch(/^https?:\/\//);
			expect(text.endsWith("/t/CDE-42")).toBe(true);
		});
	});

	// WT-24. happy-dom has no layout; the sticky classes are the evidence.
	test("the header bar stays sticky while the page scrolls", async () => {
		mountPage();
		const element = await header();
		expect(element.className).toMatch(/\bsticky\b/);
		expect(element.className).toMatch(/\btop-0\b/);
	});
});
