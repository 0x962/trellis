import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { mockMatchMedia } from "../../../../test/media";
import { callsTo, gatedServer, ghReady, heightClass, linkPrCopy, prsOf, summaryOf } from "../../../../test/prs";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PullRequests } from "./PullRequests";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	mockMatchMedia(false);
});

const renderSection = async (server: FakeServer, identifier: string, wired: FakeServer = server) => {
	const ticket = await summaryOf(server, identifier);
	return renderWithProviders(<PullRequests ticket={ticket} />, {
		path: `/t/${identifier}`,
		actor: "navid",
		server: wired,
	});
};

const rowIds = () => [...document.querySelectorAll("[data-pr-row]")].map((row) => row.getAttribute("data-pr-row"));

describe("PullRequests", () => {
	// PR-57
	test("lists one row per linked pull request in server order", async () => {
		const server = createFakeServer();
		await linkPrCopy(server, "CDE-42", { number: 122 });
		const listed = await prsOf(server, "CDE-42");
		await renderSection(server, "CDE-42");
		await waitFor(() => expect(rowIds()).toEqual(listed.map((pr) => pr.id)));
		const header = document.querySelector("[data-prs-header]")!;
		expect(header.textContent).toContain("Pull requests");
		expect(header.textContent).toContain("2");
	});

	// PR-58. One read serves every row.
	test("reads the pull requests once for the whole section", async () => {
		const server = createFakeServer();
		await linkPrCopy(server, "CDE-42", { number: 122 });
		const before = callsTo(server, "pullRequests.list").length;
		await renderSection(server, "CDE-42");
		await waitFor(() => expect(rowIds()).toHaveLength(2));
		expect(callsTo(server, "pullRequests.list")).toHaveLength(before + 1);
	});

	// PR-59
	test("shows the empty state and the Link PR field for a ticket without a pull request", async () => {
		const server = createFakeServer();
		ghReady(server);
		await renderSection(server, "CDE-47");
		expect(await screen.findByText("No pull request is linked to this ticket.")).toBeDefined();
		expect(await screen.findByRole("textbox", { name: /link pr/i })).toBeDefined();
		expect(rowIds()).toHaveLength(0);
	});

	// PR-60. The skeleton holds the space a row takes, so the page below it
	// never moves when the data arrives.
	test("holds the row height with a skeleton while the list loads", async () => {
		const server = createFakeServer();
		const gate = gatedServer(server);
		const listed = await prsOf(server, "CDE-42");
		gate.hold();
		await renderSection(server, "CDE-42", gate.server);
		const skeleton = await waitFor(() => {
			const element = document.querySelector("[data-pr-skeleton]");
			if (element === null) throw new Error("No pull request skeleton.");
			return element;
		});
		expect(heightClass(skeleton)).toBe("h-14");
		gate.release();
		await waitFor(() => expect(rowIds()).toEqual(listed.map((pr) => pr.id)));
		expect(heightClass(document.querySelector("[data-pr-row]")!)).toBe("h-14");
	});

	// PR-61
	test("puts the gh banner above the rows", async () => {
		const server = createFakeServer();
		await renderSection(server, "CDE-42");
		const banner = await waitFor(() => {
			const element = document.querySelector("[data-gh-banner]");
			if (element === null) throw new Error("No gh banner.");
			return element;
		});
		await waitFor(() => expect(rowIds()).toHaveLength(1));
		const row = document.querySelector("[data-pr-row]")!;
		expect(banner.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
		expect(await screen.findByRole("textbox", { name: /link pr/i })).toBeDefined();
	});
});
