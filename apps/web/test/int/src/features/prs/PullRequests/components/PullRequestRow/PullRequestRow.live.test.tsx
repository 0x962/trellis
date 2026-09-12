import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { createEventApplier, MAX_WAIT_MS } from "@trellis/api";
import { PullRequests } from "../../../../../../../../src/features/prs/PullRequests/PullRequests";
import { createFakeScheduler } from "../../../../../../../fakeScheduler";
import { mockMatchMedia } from "../../../../../../../media";
import { callsTo, checkList, firstPr, linkPrCopy, prRow, stateOf, summaryOf, updatePr } from "../../../../../../../prs";
import { renderWithProviders } from "../../../../../../../renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../../../server";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	mockMatchMedia(false);
});

const renderSection = async (server: TestServer, identifier: string) => {
	const ticket = await summaryOf(server, identifier);
	return renderWithProviders(<PullRequests ticket={ticket} />, { path: `/t/${identifier}`, actor: "dana", server });
};

const green = checkList(
	["lint", "pass"],
	["typecheck (desktop)", "pass"],
	["test (host-service)", "pass"],
	["build (macos-arm64)", "pass"],
);

describe("PullRequestRow live updates", () => {
	// PR-53. The seed leaves CDE-44 with a failed check, so the card starts
	// blocked and turns open when the re-run passes.
	test("follows a pr.updated event into the state icon", async () => {
		const server = createTestServer();
		const { queryClient } = await renderSection(server, "CDE-44");
		const pr = await firstPr(server, "CDE-44");
		await waitFor(async () => expect(stateOf(await prRow(pr.id))).toBe("blocked"));
		const event = await updatePr(server, pr.id, { checks: green });
		createEventApplier(queryClient).applyEvent({ type: "pr.updated", ...event });
		await waitFor(async () => expect(stateOf(await prRow(pr.id))).toBe("open"));
	});

	// PR-54. The event carries the change, so the section calls no refresh.
	test("shows the new state with no refresh control on the page", async () => {
		const server = createTestServer();
		const { queryClient } = await renderSection(server, "CDE-44");
		const pr = await firstPr(server, "CDE-44");
		await prRow(pr.id);
		const event = await updatePr(server, pr.id, { checks: green });
		createEventApplier(queryClient).applyEvent({ type: "pr.updated", ...event });
		await waitFor(async () => expect(stateOf(await prRow(pr.id))).toBe("open"));
		expect(callsTo(server, "pullRequests.refresh")).toHaveLength(0);
		expect(document.body.textContent).not.toContain("Fetched");
	});

	// PR-55. The coalescer reads the list once, however many rows hold it.
	test("costs one list read for the whole section after an event", async () => {
		const clock = createFakeScheduler();
		const server = createTestServer();
		await linkPrCopy(server, "CDE-44", { number: 123 });
		const { queryClient } = await renderSection(server, "CDE-44");
		await waitFor(() => expect(document.querySelectorAll("[data-pr-row]")).toHaveLength(2));
		const before = callsTo(server, "pullRequests.list").length;
		const pr = await firstPr(server, "CDE-44");
		const event = await updatePr(server, pr.id, { checks: green });
		createEventApplier(queryClient, { scheduler: clock.scheduler }).applyEvent({ type: "pr.updated", ...event });
		clock.advanceTo(MAX_WAIT_MS);
		await waitFor(() => expect(callsTo(server, "pullRequests.list")).toHaveLength(before + 1));
		expect(callsTo(server, "pullRequests.list")).toHaveLength(before + 1);
	});

	// PR-56
	test("swaps the state icon without an approval bar when an event merges the pull request", async () => {
		const server = createTestServer();
		const { queryClient } = await renderSection(server, "CDE-42");
		const pr = await firstPr(server, "CDE-42");
		expect(stateOf(await prRow(pr.id))).toBe("open");
		const event = await updatePr(server, pr.id, { state: "merged" });
		createEventApplier(queryClient).applyEvent({ type: "pr.updated", ...event });
		await waitFor(async () => expect(stateOf(await prRow(pr.id))).toBe("merged"));
		expect(document.querySelector("[data-merged-nudge]")).toBeNull();
	});
});
