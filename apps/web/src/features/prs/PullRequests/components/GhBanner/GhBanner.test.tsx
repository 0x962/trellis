import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import type { GhReason } from "@trellis/api";
import { createFakeServer, type FakeServer } from "../../../../../../test/fake-server";
import { mockMatchMedia } from "../../../../../../test/media";
import { ghReady, summaryOf } from "../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { renderTicket } from "../../../../../../test/ticketHost";
import { ghCopy } from "../../../../../lib/ghCopy";
import { PullRequests } from "../../PullRequests";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	mockMatchMedia(false);
});

const withReason = (server: FakeServer, reason: GhReason) => {
	server.state.gh = { ok: false, user: null, reason, message: null, checkedAt: new Date().toISOString() };
};

const renderSection = async (server: FakeServer, identifier: string) => {
	const ticket = await summaryOf(server, identifier);
	return renderWithProviders(<PullRequests ticket={ticket} />, { path: `/t/${identifier}`, actor: "navid", server });
};

const banner = async () =>
	await waitFor(() => {
		const element = document.querySelector<HTMLElement>("[data-gh-banner]");
		if (element === null) throw new Error("No gh banner.");
		return element;
	});

describe("PullRequests gh banner", () => {
	// PR-37
	test("shows the missing-gh copy with the install command", async () => {
		const server = createFakeServer();
		withReason(server, "missing");
		await renderSection(server, "CDE-42");
		const alert = await banner();
		expect(alert.getAttribute("role")).toBe("alert");
		expect(alert.textContent).toContain(ghCopy.missing.line);
		const command = within(alert).getByText("brew install gh");
		expect(command.getAttribute("class")).toContain("font-mono");
	});

	// PR-38
	test("shows the unauthenticated copy with the login command", async () => {
		const server = createFakeServer();
		withReason(server, "unauthenticated");
		await renderSection(server, "CDE-42");
		const alert = await banner();
		expect(alert.textContent).toContain(ghCopy.unauthenticated.line);
		const command = within(alert).getByText("gh auth login");
		expect(command.getAttribute("class")).toContain("font-mono");
	});

	// PR-39
	test("shows no banner while gh answers", async () => {
		const server = createFakeServer();
		ghReady(server);
		await renderSection(server, "CDE-42");
		await screen.findByText(/#118/);
		expect(document.querySelector("[data-gh-banner]")).toBeNull();
	});

	// PR-40. The settings page reads the same table, so the two surfaces
	// never word one failure in two ways.
	test("takes every line from the shared gh copy module", async () => {
		for (const reason of ["missing", "unauthenticated"] as const) {
			const server = createFakeServer();
			withReason(server, reason);
			const view = await renderSection(server, "CDE-42");
			const alert = await banner();
			expect(alert.textContent, reason).toContain(ghCopy[reason].line);
			expect(within(alert).getByText(ghCopy[reason].command!), reason).toBeDefined();
			view.unmount();
		}
	});

	// TK-5. Checks exist only on a linked PR, so a ticket with no PR shows
	// no gh notice.
	test("shows no gh notice on a ticket with no PR", async () => {
		const server = createFakeServer();
		withReason(server, "unauthenticated");
		await renderSection(server, "CDE-47");
		await screen.findByRole("button", { name: "Link PR" });
		expect(document.querySelector("[data-gh-banner]")).toBeNull();
	});

	// PR-41. A missing gh hides no stored data.
	test("keeps the stored rows visible under the banner", async () => {
		const server = createFakeServer();
		withReason(server, "missing");
		await renderSection(server, "CDE-42");
		await banner();
		await waitFor(() => expect(document.querySelectorAll("[data-pr-row]")).toHaveLength(1));
		expect(document.body.textContent).toContain("#118");
	});

	// WT-71. A gh problem shows where the pull requests are. The toast outlet
	// mounts beside the section and stays silent about gh.
	test("shows a gh problem in the section and never as a toast", async () => {
		const server = createFakeServer();
		withReason(server, "unauthenticated");
		renderTicket("CDE-42", (ticket) => <PullRequests ticket={ticket} />, { path: "/t/CDE-42", server });
		const alert = await banner();
		expect(alert.closest("section")).not.toBeNull();
		await waitFor(() => expect(document.querySelectorAll("[data-pr-row]")).toHaveLength(1));
		expect(within(screen.getByRole("status")).queryByText(/gh/)).toBeNull();
	});
});
