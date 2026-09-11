import { waitFor } from "@testing-library/react";
import type { Check, CheckBucket, GhStatus, LinkedPullRequest, PullRequest, Ticket } from "@trellis/api";
import type { FakeServer } from "./fake-server";
import { findTicket, newId } from "./fake-server/state";

// Helpers for the pull request tests. The seed links one pull request to
// CDE-42, CDE-44, CDE-45, CDE-40, CDE-37, and CDE-43, and none to CDE-47.

export { addArchivedStatus, callsTo, gatedServer, lastCallTo, statusOf } from "./inbox";

// gh answers every request, so link and refresh reach the pull request.
export const ghReady = (server: FakeServer) => {
	const status: GhStatus = {
		ok: true,
		user: "octocat",
		reason: null,
		message: null,
		checkedAt: new Date().toISOString(),
	};
	server.state.gh = status;
	return status;
};

export const summaryOf = async (server: FakeServer, identifier: string): Promise<Ticket> =>
	await server.client.tickets.get({ ticket: identifier });

export const prsOf = async (server: FakeServer, identifier: string): Promise<LinkedPullRequest[]> =>
	await server.client.pullRequests.list({ ticket: identifier });

export const firstPr = async (server: FakeServer, identifier: string): Promise<LinkedPullRequest> =>
	(await prsOf(server, identifier))[0]!;

// Writes stored fields the way a poll would, without an event.
export const patchPr = (server: FakeServer, id: string, patch: Partial<PullRequest>) => {
	const stored = server.state.prs.get(id)!;
	server.state.prs.set(id, { ...stored, ...patch });
};

// A second pull request on the same ticket, copied from the first one.
export const linkPrCopy = async (server: FakeServer, identifier: string, patch: Partial<PullRequest>) => {
	const { source, linkedBy, linkedAt, ...first } = await firstPr(server, identifier);
	const id = newId();
	const pr: PullRequest = { ...first, id, ...patch };
	server.state.prs.set(id, pr);
	server.state.prLinks.push({
		ticketId: findTicket(server.state, identifier)!.id,
		prId: id,
		source,
		linkedBy,
		linkedAt,
	});
	return pr;
};

// A check list in the shape gh reports, every check from the workflow `ci`.
export const checkList = (...pairs: [string, CheckBucket][]): Check[] =>
	pairs.map(([name, bucket]) => ({
		name,
		workflow: "ci",
		bucket,
		link: "https://github.com/acme/web/actions/runs/118",
	}));

// The row element for one pull request id, once it is on the page.
export const prRow = async (id: string) =>
	await waitFor(() => {
		const row = document.querySelector<HTMLElement>(`[data-pr-row="${id}"]`);
		if (row === null) throw new Error(`No pull request row for ${id}.`);
		return row;
	});

// The key the state icon of one row draws: open, draft, blocked, merged, or
// closed.
export const stateOf = (row: Element) => row.querySelector("[data-pr-state]")?.getAttribute("data-pr-state") ?? null;

// The key the review icon of one row draws: approved, waiting, changes, or
// idle.
export const reviewOf = (row: Element) =>
	row.querySelector("[data-review-state]")?.getAttribute("data-review-state") ?? null;

// happy-dom runs no layout, so the class that sets the height is what a test
// can compare.
export const heightClass = (element: Element) =>
	(element.getAttribute("class") ?? "").split(/\s+/).find((name) => /^h-\d/.test(name));
