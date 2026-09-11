import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../../../test/fake-server";
import { mockMatchMedia } from "../../../../../../test/media";
import { bucketsOf, firstPr, heightClass, patchPr, pillLabel, prRow, summaryOf } from "../../../../../../test/prs";
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

const headerOf = (row: HTMLElement) => within(row).getByRole("button", { name: /#118/ });

describe("PullRequestRow", () => {
	// PR-01
	test("renders the repo, the number, the title, the branch pair, the update time, and the linking actor", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		const text = (row.textContent ?? "").replace(/\s+/g, " ");
		expect(text).toContain("canary-technologies-corp/de");
		expect(text).toContain("#118");
		expect(text).toContain("Restore the fork pages");
		expect(text).toContain("2h ago");
		expect(text).toContain("claude-code");
		expect(text).toContain("· agent");
		const head = within(row).getByText("cde-42-restore-fork-pages");
		const base = within(row).getByText("main");
		expect(head.getAttribute("class")).toContain("font-mono");
		expect(base.getAttribute("class")).toContain("font-mono");
	});

	// PR-02. The ribbon is the ui package's own; the row adds no bar.
	test("draws the full check ribbon from the ui package, one segment per check", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		expect(bucketsOf(row)).toEqual(pr.checks.map((check) => check.bucket));
		const ribbons = new Set([...row.querySelectorAll("i[data-bucket]")].map((segment) => segment.parentElement));
		expect(ribbons.size).toBe(1);
		expect([...ribbons][0]!.getAttribute("class")).toContain("w-16");
	});

	// PR-03
	test("shows the pass, fail, and pending counts in one pill", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-44");
		const row = await prRow(pr.id);
		expect(row.querySelectorAll("[data-check-pill]")).toHaveLength(1);
		expect(pillLabel(row)).toBe("2 passed, 1 failed, 1 pending");
		expect((row.querySelector("[data-check-pill]")!.textContent ?? "").match(/\d+/g)).toEqual(["2", "1", "1"]);
	});

	// PR-04
	test("shows the review-state chip for an approved pull request", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		expect(row.querySelector("[data-review-chip]")!.textContent).toBe("Approved");
	});

	// PR-05
	test("hides the review-state chip when gh reports no review", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-45");
		const row = await prRow(pr.id);
		expect(pr.reviewState).toBe("none");
		expect(row.querySelector("[data-review-chip]")).toBeNull();
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

	// PR-07. A failed poll leaves the stored fields on the page and says how
	// old they are.
	test("keeps the stored fields and marks the row stale after a failed poll", async () => {
		const server = createFakeServer();
		patchPr(server, (await firstPr(server, "CDE-42")).id, { fetchError: "gh exited with code 1." });
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		expect(row.querySelector('[data-pr-state="open"]')).not.toBeNull();
		expect(bucketsOf(row)).toEqual(["pass", "pass", "pass", "pass"]);
		expect(pillLabel(row)).toBe("4 passed, 0 failed, 0 pending");
		expect(row.querySelector("[data-pr-stale]")!.textContent).toContain("2h ago");
	});

	// PR-08
	test("expands to the per-check rows by click and by Enter", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		const header = headerOf(row);
		expect(header.getAttribute("aria-expanded")).toBe("false");
		expect(row.querySelectorAll("[data-check-row]")).toHaveLength(0);
		await user.click(header);
		expect(header.getAttribute("aria-expanded")).toBe("true");
		expect((await prRow(pr.id)).querySelectorAll("[data-check-row]")).toHaveLength(4);
		await user.click(header);
		expect(header.getAttribute("aria-expanded")).toBe("false");
		header.focus();
		await user.keyboard("{Enter}");
		expect(header.getAttribute("aria-expanded")).toBe("true");
		expect((await prRow(pr.id)).querySelectorAll("[data-check-row]")).toHaveLength(4);
	});

	// PR-09
	test("remembers the expanded pull request in the session", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const first = await renderRow(server, "CDE-42");
		await user.click(headerOf(await prRow(first.pr.id)));
		expect(sessionStorage.getItem("prs-expanded")).toContain(first.pr.id);
		first.unmount();
		await renderRow(server, "CDE-42");
		const row = await prRow(first.pr.id);
		expect(headerOf(row).getAttribute("aria-expanded")).toBe("true");
		expect(row.querySelectorAll("[data-check-row]")).toHaveLength(4);
	});

	// PR-10. A pull request without checks has nothing to expand.
	test("drops the ribbon and the expand control for a pull request without checks", async () => {
		const server = createFakeServer();
		patchPr(server, (await firstPr(server, "CDE-42")).id, { checks: [], ciState: "none" });
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		expect(bucketsOf(row)).toEqual([]);
		expect(row.querySelector("[aria-expanded]")).toBeNull();
		expect(row.querySelectorAll("[data-check-row]")).toHaveLength(0);
		expect(screen.queryByRole("button", { name: /#118/ })).toBeNull();
	});

	// The settings name the diff viewer, so the row sends its diff there.
	test("offers Show diff, which opens the diff of the pull request in a new tab", async () => {
		const server = createFakeServer();
		const { pr } = await renderRow(server, "CDE-42");
		const row = await prRow(pr.id);
		const link = await within(row).findByRole("link", { name: "Show diff" });
		expect(link.getAttribute("href")).toBe(`${pr.url}/files`);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
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
