import { waitFor } from "@testing-library/react";
import type {
	Check,
	CheckBucket,
	CiState,
	GhStatus,
	LinkedPullRequest,
	PrState,
	PullRequest,
	ReviewState,
	Ticket,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { deriveCiState } from "../../server/src/gh/parse.ts";
import { sharedDb } from "./server/db.ts";
import type { TestServer } from "./server/index.ts";
import { PR_OWNER, PR_REPO } from "./server/seed/support.ts";

// The fields a poll writes back onto a stored pull request.
export type PrPatch = {
	checks?: Check[];
	state?: PrState;
	isDraft?: boolean;
	reviewState?: ReviewState;
};

// Helpers for the pull request tests. The seed links one pull request to
// CDE-42, CDE-44, CDE-45, CDE-40, CDE-37, and CDE-43, and none to CDE-47.

export { addArchivedStatus, callsTo, gatedServer, lastCallTo, statusOf } from "./inbox";

// gh answers every request, so link and refresh reach the pull request.
export const ghReady = (server: TestServer) => {
	const status: GhStatus = {
		ok: true,
		user: "octocat",
		reason: null,
		message: null,
		checkedAt: new Date().toISOString(),
	};
	server.setGh(status);
	return status;
};

export const summaryOf = async (server: TestServer, identifier: string): Promise<Ticket> =>
	await server.client.tickets.get({ ticket: identifier });

export const prsOf = async (server: TestServer, identifier: string): Promise<LinkedPullRequest[]> =>
	await server.client.pullRequests.list({ ticket: identifier });

export const firstPr = async (server: TestServer, identifier: string): Promise<LinkedPullRequest> =>
	(await prsOf(server, identifier))[0] as LinkedPullRequest;

// The column behind each field of the wire shape.
const columns: Record<string, string> = {
	title: "title",
	url: "url",
	state: "state",
	isDraft: "is_draft",
	headRef: "head_ref",
	baseRef: "base_ref",
	reviewState: "review_state",
	mergedAt: "merged_at",
	closedAt: "closed_at",
	checks: "checks",
	ciState: "ci_state",
	fetchedAt: "fetched_at",
	fetchError: "fetch_error",
	createdAt: "created_at",
	updatedAt: "updated_at",
};

// Writes stored fields the way a poll would, without an event. The poller
// writes the same columns; a test that wants the event drives `refresh`.
export const patchPr = async (server: TestServer, id: string, patch: Partial<PullRequest>) => {
	await server.ready;
	const { db } = await sharedDb();
	const sets = Object.entries(patch).map(([field, value]) => {
		const column = sql.identifier(columns[field] as string);
		if (field === "checks") return sql`${column} = ${JSON.stringify(value)}::jsonb`;
		return sql`${column} = ${value}`;
	});
	await db.execute(sql`UPDATE pull_requests SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
};

// Writes one stored pull request the way a gh poll would, folds `ciState`
// from the buckets, and gives back the payload a `pr.updated` event carries.
export const updatePr = async (server: TestServer, id: string, patch: PrPatch) => {
	const checks = patch.checks;
	await patchPr(server, id, {
		...patch,
		fetchedAt: new Date().toISOString(),
		...(checks === undefined ? {} : { ciState: deriveCiState(checks) }),
	});
	const { db } = await sharedDb();
	const found = await db.execute(sql`
		SELECT p.state, p.ci_state, array_agg(l.ticket_id ORDER BY l.created_at) AS ticket_ids
		FROM pull_requests p JOIN ticket_pull_requests l ON l.pull_request_id = p.id
		WHERE p.id = ${id} GROUP BY p.state, p.ci_state
	`);
	const row = found.rows[0] as { state: PrState; ci_state: CiState; ticket_ids: string[] };
	return { id, ticketIds: row.ticket_ids, state: row.state, ciState: row.ci_state };
};

// A second pull request on the same ticket, copied from the first one. The
// gh stub answers the link with the copy's fields.
export const linkPrCopy = async (server: TestServer, identifier: string, patch: Partial<PullRequest>) => {
	const first = await firstPr(server, identifier);
	const number = patch.number ?? first.number + 1;
	await server.armPr({
		number,
		title: patch.title ?? first.title,
		headRef: patch.headRef ?? `${first.headRef}-copy`,
		checks: (patch.checks ?? first.checks).map((check) => [check.name, check.bucket] as [string, CheckBucket]),
		review: patch.reviewState === "approved" ? "APPROVED" : null,
	});
	const linked = await server.client.pullRequests.link({
		ticket: identifier,
		url: `https://github.com/${PR_OWNER}/${PR_REPO}/pull/${number}`,
	});
	const rest = Object.fromEntries(
		Object.entries(patch).filter(([field]) => field !== "number" && field in columns),
	) as Partial<PullRequest>;
	if (Object.keys(rest).length > 0) await patchPr(server, linked.id, rest);
	return { ...linked, ...rest } as PullRequest;
};

// A check list in the shape gh reports, every check from the workflow `ci`.
export const checkList = (...pairs: [string, CheckBucket][]): Check[] =>
	pairs.map(([name, bucket]) => ({
		name,
		workflow: "ci",
		bucket,
		link: `https://github.com/${PR_OWNER}/${PR_REPO}/actions/runs/118`,
	}));

// The row element for one pull request id, once it is on the page.
export const prRow = async (id: string) =>
	await waitFor(() => {
		const row = document.querySelector<HTMLElement>(`[data-pr-row="${id}"]`);
		if (row === null) throw new Error(`No pull request row for ${id}.`);
		return row;
	});

export const bucketsOf = (row: Element) =>
	[...row.querySelectorAll("i[data-bucket]")].map((segment) => segment.getAttribute("data-bucket"));

export const pillLabel = (row: Element) => row.querySelector("[data-check-pill]")?.getAttribute("aria-label") ?? null;

// happy-dom runs no layout, so the class that sets the height is what a test
// can compare.
export const heightClass = (element: Element) =>
	(element.getAttribute("class") ?? "").split(/\s+/).find((name) => /^h-\d/.test(name));
