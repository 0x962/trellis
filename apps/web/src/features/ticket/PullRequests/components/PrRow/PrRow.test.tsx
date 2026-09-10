import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Check, LinkedPullRequest, Ticket } from "@trellis/api";
import { createFakeServer, type FakeServer } from "../../../../../../test/fake-server";
import { findTicket } from "../../../../../../test/fake-server/state";
import { ago, minute, renderTicket, statusOf } from "../../../../../../test/ticketHost";
import { PrRow } from "./PrRow";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
});

const check = (name: string, bucket: Check["bucket"]): Check => ({
	name,
	workflow: "ci",
	bucket,
	link: `https://github.com/canary-technologies-corp/de/actions/runs/${name}`,
});

// Twelve passing, one failing, two pending: the pill of the outcome.
const mixedChecks = [
	...Array.from({ length: 12 }, (_, index) => check(`pass-${index}`, "pass")),
	check("typecheck", "fail"),
	check("build-1", "pending"),
	check("build-2", "pending"),
];

type Shape = (pr: LinkedPullRequest) => LinkedPullRequest[];

// Renders the rows of CDE-42 as the section does: each row gets the PR and
// the ticket it hangs on. `shape` reshapes the seeded PR #118 first.
const mount = (shape: Shape, server: FakeServer = createFakeServer()) =>
	renderTicket(
		"CDE-42",
		(ticket: Ticket) => (
			<ul>
				{shape(ticket.prs[0]!).map((pr) => (
					<PrRow key={pr.id} pr={pr} ticket={ticket} />
				))}
			</ul>
		),
		{ path: "/t/CDE-42", server },
	);

const row = (number: number) => screen.findByRole("button", { name: new RegExp(`#${number}`) });

const withId = (pr: LinkedPullRequest, suffix: string) => ({ ...pr, id: `${pr.id.slice(0, 25)}${suffix}` });

describe("features/ticket/PullRequests/components/PrRow", () => {
	// WT-63
	test("renders the state, the ribbon, the pill, the review chip, and the branches", async () => {
		mount((pr) => [{ ...pr, checks: mixedChecks, ciState: "fail", updatedAt: ago(3 * minute) }]);
		const element = await row(118);
		expect(within(element).getByRole("img", { name: "Open pull request" })).toBeDefined();
		expect(element.textContent).toContain("canary-technologies-corp/de #118");
		expect(element.textContent).toContain("Restore the fork pages");
		const buckets = [...element.querySelectorAll("[data-bucket]")].map((segment) =>
			segment.getAttribute("data-bucket"),
		);
		expect(buckets).toEqual(mixedChecks.map((entry) => entry.bucket));
		const pill = within(element).getByText((_, node) => /^\D*12\D+1\D+2\D*$/.test(node?.textContent ?? ""));
		expect(pill.textContent!.replace(/\s+/g, " ")).toContain("12 · 1 · 2");
		expect(within(element).getByText("Approved")).toBeDefined();
		expect(element.textContent!.replace(/\s+/g, " ")).toContain("cde-42-restore-fork-pages → main");
		expect(element.textContent).toContain("3m");
	});

	// WT-64
	test("a PR without checks reads No checks", async () => {
		mount((pr) => [{ ...pr, checks: [], ciState: "none" }]);
		const element = await row(118);
		expect(within(element).getByText("No checks")).toBeDefined();
		expect(element.querySelectorAll("[data-bucket]")).toHaveLength(0);
	});

	// WT-65. The name is the signal a screen reader gets; color is not.
	test("every PR state carries a named icon", async () => {
		mount((pr) => [
			{ ...withId(pr, "1"), number: 1, state: "open" },
			{ ...withId(pr, "2"), number: 2, state: "open", isDraft: true },
			{ ...withId(pr, "3"), number: 3, state: "merged", mergedAt: ago(minute) },
			{ ...withId(pr, "4"), number: 4, state: "closed", closedAt: ago(minute) },
		]);
		await row(4);
		const names = screen.getAllByRole("img", { name: /pull request$/ }).map((icon) => icon.getAttribute("aria-label"));
		expect(names).toEqual(["Open pull request", "Draft pull request", "Merged pull request", "Closed pull request"]);
	});

	// WT-67. The expansion is per PR and lives for the tab session.
	test("remembers the expanded PR for the session", async () => {
		const user = userEvent.setup();
		const first = mount((pr) => [pr]);
		const element = await row(118);
		expect(element.getAttribute("aria-expanded")).toBe("false");
		await user.click(element);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /#118/ }).getAttribute("aria-expanded")).toBe("true"),
		);
		const id = (await first.server.client.tickets.get({ ticket: "CDE-42" })).prs[0]!.id;
		const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index)!);
		expect(keys.map((key) => `${key}=${sessionStorage.getItem(key)}`).join("\n")).toContain(id);
		first.unmount();
		mount((pr) => [pr]);
		expect((await row(118)).getAttribute("aria-expanded")).toBe("true");
		expect(await screen.findByText("lint")).toBeDefined();
	});

	// WT-69. CDE-42 sits in Human Review. Shipped is a done status placed
	// before Done, so it is the lowest-position done status.
	test("a merged PR on a review status offers Mark Done", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await server.client.statuses.create({ project: "CDE", name: "Shipped", category: "done" });
		await server.client.statuses.reorder({
			project: "CDE",
			statuses: ["todo", "in-progress", "agent-review", "human-review", "shipped", "done", "canceled"],
		});
		const ticket = findTicket(server.state, "CDE-42")!;
		const link = server.state.prLinks.find((entry) => entry.ticketId === ticket.id)!;
		const pr = server.state.prs.get(link.prId)!;
		pr.state = "merged";
		pr.mergedAt = ago(minute);
		mount((seeded) => [seeded], server);
		const element = await row(118);
		const nudge = await screen.findByText(/PR merged.*Mark Done\?/);
		expect(element.compareDocumentPosition(nudge) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
		await user.click(screen.getByRole("button", { name: "Mark Done" }));
		await waitFor(() => expect(server.callsTo("tickets.move")).toHaveLength(1));
		expect(statusOf(server.state.statuses.values(), server.callsTo("tickets.move")[0]!.input)!.name).toBe("Shipped");
	});
});
