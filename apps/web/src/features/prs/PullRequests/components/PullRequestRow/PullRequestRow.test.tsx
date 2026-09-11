import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../../../test/fake-server";
import { mockMatchMedia } from "../../../../../../test/media";
import {
	callsTo,
	firstPr,
	heightClass,
	patchPr,
	prRow,
	prsOf,
	reviewOf,
	stateOf,
	summaryOf,
} from "../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { PullRequestRow } from "./PullRequestRow";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	mockMatchMedia(false);
});

const renderRow = async (server: FakeServer, identifier: string) => {
	const ticket = await summaryOf(server, identifier);
	const pr = await firstPr(server, identifier);
	const view = renderWithProviders(<PullRequestRow ticket={ticket} pr={pr} />, {
		path: `/t/${identifier}`,
		actor: "navid",
		server,
	});
	return { ...view, ticket, pr };
};

const flat = (row: Element) => (row.textContent ?? "").replace(/\s+/g, " ");

describe("PullRequestRow", () => {
	// PR-01. The card carries the title, the number, and the branch pair.
	test("renders the title, the number, and the branch pair", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		expect(flat(row)).toContain("#118");
		expect(flat(row)).toContain("Restore the fork pages");
		const head = within(row).getByText("cde-42-restore-fork-pages");
		const base = within(row).getByText("main");
		expect(head.getAttribute("class")).toContain("font-mono");
		expect(base.getAttribute("class")).toContain("font-mono");
	});

	// PR-02. The state icon carries the CI state, so the card holds no check
	// ribbon, no count pill, and no per-check row.
	test("draws no check ribbon, no count pill, and no check row", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-44");
		const row = await prRow(pr.id);
		expect(row.querySelectorAll("i[data-bucket]")).toHaveLength(0);
		expect(row.querySelectorAll("[data-check-pill]")).toHaveLength(0);
		expect(row.querySelectorAll("[data-check-row]")).toHaveLength(0);
		expect(row.querySelector("[aria-expanded]")).toBeNull();
	});

	// PR-03. The repo, the update time, and the actor who linked the pull
	// request stay off the card.
	test("names no repo, no update time, and no linking actor", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		const text = flat(row);
		expect(text).not.toContain("canary-technologies-corp");
		expect(text).not.toContain("claude-code");
		expect(text).not.toContain("ago");
		expect(row.querySelector("[data-pr-repo]")).toBeNull();
	});

	// PR-04
	test("draws the approved review state on the right of the card", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		expect(pr.reviewState).toBe("approved");
		const icon = row.querySelector("[data-review-state]")!;
		expect(reviewOf(row)).toBe("approved");
		const title = within(row).getByText("Restore the fork pages");
		expect(title.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
	});

	// PR-05. Every card holds a review icon, so a row with no review keeps
	// the same shape as a row with one.
	test("draws the idle review state when gh reports no review", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-45");
		const row = await prRow(pr.id);
		expect(pr.reviewState).toBe("none");
		expect(reviewOf(row)).toBe("idle");
	});

	// PR-06. A row that gains a check pushes nothing below it.
	test("keeps the row at a fixed height of 56 px", async () => {
		const server = createFakeServer();
		patchPr(server, (await firstPr(server, "CDE-45")).id, { checks: [], ciState: "none" });
		const withChecks = await firstPr(server, "CDE-42");
		const without = await firstPr(server, "CDE-45");
		const ticket42 = await summaryOf(server, "CDE-42");
		const ticket45 = await summaryOf(server, "CDE-45");
		renderWithProviders(
			<>
				<PullRequestRow ticket={ticket42} pr={withChecks} />
				<PullRequestRow ticket={ticket45} pr={without} />
			</>,
			{ path: "/t/CDE-42", actor: "navid", server },
		);
		expect(heightClass(await prRow(withChecks.id))).toBe("h-14");
		expect(heightClass(await prRow(without.id))).toBe("h-14");
	});

	// PR-07. A failed poll leaves the stored fields on the page and says that
	// the fetch failed.
	test("keeps the stored fields and marks the row stale after a failed poll", async () => {
		const server = createFakeServer();
		patchPr(server, (await firstPr(server, "CDE-42")).id, { fetchError: "gh exited with code 1." });
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		expect(stateOf(row)).toBe("open");
		expect(flat(row)).toContain("Restore the fork pages");
		const stale = row.querySelector("[data-pr-stale]")!;
		expect(stale.getAttribute("title")).toBe("gh exited with code 1.");
		expect(flat(row)).not.toContain("ago");
	});

	// PR-08. The settings name the diff viewer, so the card sends its diff
	// there. The link covers the card, so a click anywhere opens the diff.
	test("opens the diff of the pull request from a click on the card", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		const link = await within(row).findByRole("link", { name: "Restore the fork pages" });
		expect(link.getAttribute("href")).toBe(`${pr.url}/files`);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
		expect(link.getAttribute("class")).toContain("before:inset-0");
		expect(row.getAttribute("class")).toContain("relative");
	});

	// PR-09. The menu is gone, so the card keeps one visible control per
	// action.
	test("offers no actions menu", async () => {
		const server = createFakeServer();
		await renderRow(server, "CDE-42");
		expect(screen.queryByRole("button", { name: "PR actions" })).toBeNull();
	});

	// PR-10. Unlink sits on the card, so a pull request linked by mistake
	// comes off the ticket without the CLI.
	test("unlinks the pull request from the card", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const { pr, ticket } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		const button = within(row).getByRole("button", { name: "Unlink PR #118" });
		expect(button.getAttribute("class")).toContain("opacity-0");
		expect(button.getAttribute("class")).toContain("group-hover:opacity-100");
		await user.click(button);
		await waitFor(() => expect(callsTo(server, "pullRequests.unlink")).toHaveLength(1));
		expect(await prsOf(server, ticket.identifier)).toHaveLength(0);
	});

	// PR-24. The card opens the diff, so GitHub keeps a control of its own.
	test("opens the pull request on GitHub from a control of its own", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		const button = within(row).getByRole("button", { name: "Open on GitHub" });
		expect(button.getAttribute("class")).toContain("group-hover:opacity-100");
	});
});

test("merged pull requests show no ticket approval bar or automatic move", async () => {
	const server = createFakeServer();
	patchPr(server, (await firstPr(server, "CDE-42")).id, {
		state: "merged",
		mergedAt: new Date().toISOString(),
	});
	const { pr } = await renderRow(server, "CDE-42");
	await prRow(pr.id);
	expect(document.querySelector("[data-merged-nudge]")).toBeNull();
	expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
	expect(server.callsTo("tickets.move")).toHaveLength(0);
});
