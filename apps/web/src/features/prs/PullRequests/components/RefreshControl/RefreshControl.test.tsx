import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../../../test/fake-server";
import { mockMatchMedia } from "../../../../../../test/media";
import { callsTo, firstPr, ghReady, linkPrCopy, patchPr, prsOf, summaryOf } from "../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { ghCopy } from "../../../../../lib/ghCopy";
import { PullRequests } from "../../PullRequests";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	mockMatchMedia(false);
});

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const renderSection = async (server: FakeServer, identifier: string) => {
	const ticket = await summaryOf(server, identifier);
	return renderWithProviders(<PullRequests ticket={ticket} />, { path: `/t/${identifier}`, actor: "navid", server });
};

// The seeded pull request fetched 40 s ago, beside an older second one.
const twoFetches = async (server: FakeServer) => {
	patchPr(server, (await firstPr(server, "CDE-42")).id, { fetchedAt: ago(40_000) });
	await linkPrCopy(server, "CDE-42", { number: 122, fetchedAt: ago(10 * 60_000) });
};

const refreshButton = async () => await screen.findByRole("button", { name: /refresh/i });

const header = () => document.querySelector("[data-prs-header]")!;

describe("RefreshControl", () => {
	// PR-42
	test("reads the fetch age from the newest fetched pull request", async () => {
		const server = createFakeServer();
		await twoFetches(server);
		await renderSection(server, "CDE-42");
		await waitFor(() => expect(header().textContent).toContain("Fetched 40s ago"));
	});

	// PR-43
	test("refreshes every listed pull request on one click", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		ghReady(server);
		await twoFetches(server);
		const listed = await prsOf(server, "CDE-42");
		await renderSection(server, "CDE-42");
		await waitFor(() => expect(document.querySelectorAll("[data-pr-row]")).toHaveLength(2));
		await user.click(await refreshButton());
		await waitFor(() => expect(callsTo(server, "pullRequests.refresh")).toHaveLength(2));
		const asked = callsTo(server, "pullRequests.refresh").map((call) => (call.input as { id: string }).id);
		expect(asked.sort()).toEqual(listed.map((pr) => pr.id).sort());
	});

	// PR-44
	test("moves the fetch age to just now after a refresh", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		ghReady(server);
		await twoFetches(server);
		await renderSection(server, "CDE-42");
		await waitFor(() => expect(header().textContent).toContain("Fetched 40s ago"));
		await user.click(await refreshButton());
		await waitFor(() => expect(header().textContent).toContain("Fetched just now"));
	});

	// PR-45. The seed reports gh as missing.
	test("shows GH_UNAVAILABLE inline and keeps the rows after a failed refresh", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await twoFetches(server);
		await renderSection(server, "CDE-42");
		await waitFor(() => expect(document.querySelectorAll("[data-pr-row]")).toHaveLength(2));
		await user.click(await refreshButton());
		const error = await waitFor(() => {
			const element = document.querySelector<HTMLElement>("[data-refresh-error]");
			if (element === null) throw new Error("No refresh error.");
			return element;
		});
		expect(error.getAttribute("role")).toBe("alert");
		expect(error.textContent).toContain(ghCopy.missing.line);
		expect(document.querySelectorAll("[data-pr-row]")).toHaveLength(2);
		expect(document.body.textContent).toContain("#118");
	});

	// PR-46. Nothing was fetched, so there is no age to state.
	test("hides the fetch age when the ticket has no pull request", async () => {
		const server = createFakeServer();
		ghReady(server);
		await renderSection(server, "CDE-47");
		await screen.findByRole("textbox", { name: /link pr/i });
		expect(header().textContent).not.toContain("Fetched");
		expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
	});
});
