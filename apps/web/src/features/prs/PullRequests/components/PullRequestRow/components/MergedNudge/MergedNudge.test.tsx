import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../../../../../test/media";
import {
	addArchivedStatus,
	callsTo,
	firstPr,
	lastCallTo,
	patchPr,
	prRow,
	statusOf,
	summaryOf,
} from "../../../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../../../../test/server";
import { PullRequestRow } from "../../PullRequestRow";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	mockMatchMedia(false);
});

const merged = { state: "merged" as const, mergedAt: new Date(Date.now() - 60_000).toISOString() };

const nudge = () => document.querySelector("[data-merged-nudge]");

const renderRow = async (server: TestServer, identifier: string) => {
	const ticket = await summaryOf(server, identifier);
	const pr = await firstPr(server, identifier);
	const view = renderWithProviders(<PullRequestRow ticket={ticket} pr={pr} />, {
		path: `/t/${identifier}`,
		actor: "navid",
		server,
	});
	return { ...view, ticket, pr };
};

describe("MergedNudge", () => {
	// PR-47. CDE-42 waits in Human Review, a review-category status.
	test("offers the merged nudge on a review status", async () => {
		const server = createTestServer();
		patchPr(server, (await firstPr(server, "CDE-42")).id, merged);
		await renderRow(server, "CDE-42");
		await waitFor(() => expect(nudge()).not.toBeNull());
		expect(nudge()!.textContent).toContain("The PR is merged. Approve the ticket?");
		expect(await screen.findByRole("button", { name: /^approve$/i })).toBeDefined();
	});

	// PR-48. CDE-44 is still in progress, so the work is not up for review.
	test("shows no nudge outside a review status", async () => {
		const server = createTestServer();
		patchPr(server, (await firstPr(server, "CDE-44")).id, merged);
		const { ticket, pr } = await renderRow(server, "CDE-44");
		expect(ticket.status.category).toBe("started");
		await prRow(pr.id);
		expect(nudge()).toBeNull();
	});

	// PR-49
	test("shows no nudge while the pull request is open", async () => {
		const server = createTestServer();
		const { pr } = await renderRow(server, "CDE-42");
		expect(pr.state).toBe("open");
		await prRow(pr.id);
		expect(nudge()).toBeNull();
	});

	// PR-50. CDE owns Done at position 4 and Archived at position 6, so the
	// nudge lands on Done.
	test("moves the ticket to the lowest-position done status", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await addArchivedStatus(server);
		patchPr(server, (await firstPr(server, "CDE-42")).id, merged);
		const done = await statusOf(server, "CDE", "done");
		await renderRow(server, "CDE-42");
		await user.click(await screen.findByRole("button", { name: /^approve$/i }));
		await waitFor(() => expect(lastCallTo(server, "tickets.move")).toBeDefined());
		expect(lastCallTo(server, "tickets.move")!.input).toEqual({ ticket: "CDE-42", status: done.id });
	});

	// PR-51. v1 has no automatic transition; the person decides.
	test("writes nothing until the person clicks the button", async () => {
		const server = createTestServer();
		patchPr(server, (await firstPr(server, "CDE-42")).id, merged);
		await renderRow(server, "CDE-42");
		await waitFor(() => expect(nudge()).not.toBeNull());
		expect(callsTo(server, "tickets.move")).toHaveLength(0);
		expect(callsTo(server, "tickets.update")).toHaveLength(0);
	});

	// PR-52
	test("drops the nudge after the ticket reaches Done", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		patchPr(server, (await firstPr(server, "CDE-42")).id, merged);
		const first = await renderRow(server, "CDE-42");
		await user.click(await screen.findByRole("button", { name: /^approve$/i }));
		await waitFor(() => expect(lastCallTo(server, "tickets.move")).toBeDefined());
		const moved = await summaryOf(server, "CDE-42");
		expect(moved.status.category).toBe("done");
		first.unmount();
		renderWithProviders(<PullRequestRow ticket={moved} pr={first.pr} />, {
			path: "/t/CDE-42",
			actor: "navid",
			server,
			harness: first,
		});
		await waitFor(() => expect(nudge()).toBeNull());
	});
});
