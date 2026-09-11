import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { createEventApplier, MAX_WAIT_MS } from "@trellis/api";
import { createFakeScheduler } from "../../../../../../test/fakeScheduler";
import { mockMatchMedia } from "../../../../../../test/media";
import {
	bucketsOf,
	callsTo,
	checkList,
	firstPr,
	linkPrCopy,
	pillLabel,
	prRow,
	summaryOf,
	updatePr,
} from "../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../../test/server";
import { PullRequests } from "../../PullRequests";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	mockMatchMedia(false);
});

const renderSection = async (server: TestServer, identifier: string) => {
	const ticket = await summaryOf(server, identifier);
	return renderWithProviders(<PullRequests ticket={ticket} />, { path: `/t/${identifier}`, actor: "dana", server });
};

const settled = checkList(
	["lint", "pass"],
	["typecheck (desktop)", "fail"],
	["test (host-service)", "pass"],
	["build (macos-arm64)", "pass"],
);

describe("PullRequestRow live updates", () => {
	// PR-53
	test("follows a pr.updated event into the ribbon and the counts", async () => {
		const server = createTestServer();
		const { queryClient } = await renderSection(server, "CDE-44");
		const pr = await firstPr(server, "CDE-44");
		await waitFor(async () => expect(pillLabel(await prRow(pr.id))).toBe("2 passed, 1 failed, 1 pending"));
		const event = await updatePr(server, pr.id, { checks: settled });
		createEventApplier(queryClient).applyEvent({ type: "pr.updated", ...event });
		await waitFor(async () => expect(pillLabel(await prRow(pr.id))).toBe("3 passed, 1 failed, 0 pending"));
		expect(bucketsOf(await prRow(pr.id))).toEqual(["pass", "fail", "pass", "pass"]);
	});

	// PR-54. The event carries the change, so nobody presses refresh.
	test("needs no refresh click to show the new state", async () => {
		const server = createTestServer();
		const { queryClient } = await renderSection(server, "CDE-44");
		const pr = await firstPr(server, "CDE-44");
		await prRow(pr.id);
		const event = await updatePr(server, pr.id, { checks: settled });
		createEventApplier(queryClient).applyEvent({ type: "pr.updated", ...event });
		await waitFor(async () => expect(pillLabel(await prRow(pr.id))).toBe("3 passed, 1 failed, 0 pending"));
		expect(callsTo(server, "pullRequests.refresh")).toHaveLength(0);
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
		const event = await updatePr(server, pr.id, { checks: settled });
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
		expect((await prRow(pr.id)).querySelector('[data-pr-state="open"]')).not.toBeNull();
		const event = await updatePr(server, pr.id, { state: "merged" });
		createEventApplier(queryClient).applyEvent({ type: "pr.updated", ...event });
		await waitFor(async () => expect((await prRow(pr.id)).querySelector('[data-pr-state="merged"]')).not.toBeNull());
		expect(document.querySelector("[data-merged-nudge]")).toBeNull();
	});
});
