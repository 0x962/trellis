import type { Check, CiState, LinkedPullRequest, PrState, PullRequest, PullRequestDiffOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fetchDiff } from "../gh/diff.ts";
import { fetchPullRequests, type PullRequestRef, type PullRequestRow } from "../gh/graphql.ts";
import {
	type ActorRef,
	assertProjectActive,
	fail,
	notFound,
	resolveTicket,
	type ServiceCtx,
	type TicketRow,
	touchActor,
	touchTicket,
	writeActivity,
} from "./support.ts";

// One pull request is one row, whatever number of tickets link it. The link
// row carries who linked it and whether a person or the poller did. The last
// link that goes takes the pull request row with it.
//
// link and refresh read one pull request through the same gh query the poller
// runs for 50. link stores what it got, or the gh message when gh is away, so
// a ticket keeps the link either way. refresh reports GH_UNAVAILABLE instead,
// because the caller asked for fresh fields.

// The diff of one pull request, by pull request id, with the clock reading
// of the gh call. A person who reopens a diff inside a minute spawns no
// process.
const DIFF_CACHE_MS = 60_000;
const diffCache = new Map<string, { at: number; value: PullRequestDiffOutput }>();

const PULL_URL = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/([1-9][0-9]*)(?:[/?#]|$)/i;

// The owner and the repository are case-insensitive on GitHub and lower-case
// in the database, so two spellings of one pull request are one row.
export const parsePullRequestUrl = (url: string): PullRequestRef | null => {
	const match = PULL_URL.exec(url);
	if (match === null) return null;
	return { owner: match[1]!.toLowerCase(), repo: match[2]!.toLowerCase(), number: Number(match[3]) };
};

type PrRow = {
	id: string;
	owner: string;
	repo: string;
	number: number;
	url: string;
	title: string;
	state: PrState;
	is_draft: boolean;
	head_ref: string;
	base_ref: string;
	review_state: PullRequest["reviewState"];
	merged_at: string | null;
	closed_at: string | null;
	checks: Check[];
	ci_state: CiState;
	content_hash: string | null;
	fetched_at: string | null;
	fetch_error: string | null;
	created_at: string;
	updated_at: string;
};

type LinkRow = PrRow & { source: LinkedPullRequest["source"]; actor_name: string; actor_kind: ActorRef["kind"] };

const prColumns = sql`
	p.id, p.owner, p.repo, p.number, p.url, p.title, p.state, p.is_draft, p.head_ref, p.base_ref, p.review_state,
	${iso(sql`p.merged_at`)} AS merged_at, ${iso(sql`p.closed_at`)} AS closed_at, p.checks, p.ci_state,
	p.content_hash, ${iso(sql`p.fetched_at`)} AS fetched_at, p.fetch_error,
	${iso(sql`p.created_at`)} AS created_at, ${iso(sql`p.updated_at`)} AS updated_at
`;

const toPullRequest = (row: PrRow): PullRequest => ({
	id: row.id,
	owner: row.owner,
	repo: row.repo,
	number: row.number,
	url: row.url,
	title: row.title,
	state: row.state,
	isDraft: row.is_draft,
	headRef: row.head_ref,
	baseRef: row.base_ref,
	reviewState: row.review_state,
	mergedAt: row.merged_at,
	closedAt: row.closed_at,
	checks: row.checks,
	ciState: row.ci_state,
	fetchedAt: row.fetched_at,
	fetchError: row.fetch_error,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const toLinked = (row: LinkRow, linkedAt: string): LinkedPullRequest => ({
	...toPullRequest(row),
	source: row.source,
	linkedBy: { name: row.actor_name, kind: row.actor_kind },
	linkedAt,
});

const findRow = async (tx: Tx, id: string): Promise<PrRow> => {
	const [row] = await rows<PrRow>(tx, sql`SELECT ${prColumns} FROM pull_requests p WHERE p.id = ${id}`);
	if (row === undefined) throw notFound("pullRequest", id);
	return row;
};

const linkedTicketIds = async (tx: Tx, id: string) => {
	const found = await rows<{ ticket_id: string }>(
		tx,
		sql`SELECT ticket_id FROM ticket_pull_requests WHERE pull_request_id = ${id} ORDER BY created_at, ticket_id`,
	);
	return found.map((row) => row.ticket_id);
};

// The fields gh returned, or the message it printed. A message is stored on
// the row, so the web shows why the fields are stale.
type Fetched = { row: PullRequestRow } | { error: string };

const fetchOne = async (ctx: ServiceCtx, ref: PullRequestRef): Promise<Fetched> => {
	const result = await fetchPullRequests(ctx.gh, [ref], "interactive");
	if (!result.ok) return { error: result.message };
	const first = result.results[0]!;
	return "row" in first ? { row: first.row } : { error: first.error };
};

const writeFetched = (tx: Tx, at: Date, row: PullRequestRow) =>
	tx.execute(sql`
	INSERT INTO pull_requests (
		id, owner, repo, number, url, title, state, is_draft, head_ref, base_ref, review_state,
		merged_at, closed_at, checks, ci_state, content_hash, fetched_at, fetch_error, created_at, updated_at
	) VALUES (
		${ulid()}, ${row.owner}, ${row.repo}, ${row.number}, ${row.url}, ${row.title}, ${row.state}, ${row.isDraft},
		${row.headRef}, ${row.baseRef}, ${row.reviewState}, ${row.mergedAt}, ${row.closedAt},
		${JSON.stringify(row.checks)}::jsonb, ${row.ciState}, ${row.contentHash}, ${at}, NULL, ${at}, ${at}
	)
	ON CONFLICT (owner, repo, number) DO UPDATE SET
		url = EXCLUDED.url, title = EXCLUDED.title, state = EXCLUDED.state, is_draft = EXCLUDED.is_draft,
		head_ref = EXCLUDED.head_ref, base_ref = EXCLUDED.base_ref, review_state = EXCLUDED.review_state,
		merged_at = EXCLUDED.merged_at, closed_at = EXCLUDED.closed_at, checks = EXCLUDED.checks,
		ci_state = EXCLUDED.ci_state, content_hash = EXCLUDED.content_hash, fetched_at = EXCLUDED.fetched_at,
		fetch_error = NULL, updated_at = EXCLUDED.updated_at
`);

// A pull request gh could not answer for still gets its row, with the gh
// message and the default fields, so the link survives a network outage.
const writeUnfetched = (tx: Tx, at: Date, ref: PullRequestRef, url: string, error: string) =>
	tx.execute(sql`
	INSERT INTO pull_requests (id, owner, repo, number, url, state, fetch_error, created_at, updated_at)
	VALUES (${ulid()}, ${ref.owner}, ${ref.repo}, ${ref.number}, ${url}, 'open', ${error}, ${at}, ${at})
	ON CONFLICT (owner, repo, number) DO UPDATE SET fetch_error = EXCLUDED.fetch_error
`);

export type LinkInput = { ticket: string; url: string; source?: LinkedPullRequest["source"] };

export const link = async (ctx: ServiceCtx, tx: Tx, input: LinkInput): Promise<LinkedPullRequest> => {
	const ref = parsePullRequestUrl(input.url);
	if (ref === null) throw fail("INVALID_PR_URL");
	const ticket = await resolveTicket(tx, input.ticket);
	assertProjectActive(ticket);
	const fetched = await fetchOne(ctx, ref);
	const at = ctx.now();
	if ("row" in fetched) await writeFetched(tx, at, fetched.row);
	else await writeUnfetched(tx, at, ref, input.url, fetched.error);
	const [stored] = await rows<PrRow>(
		tx,
		sql`SELECT ${prColumns} FROM pull_requests p WHERE p.owner = ${ref.owner} AND p.repo = ${ref.repo} AND p.number = ${ref.number}`,
	);
	const source = input.source ?? "manual";
	await touchActor(tx, ctx.actor, at);
	const created = await tx.execute(sql`
		INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket.id}, ${stored!.id}, ${source}, ${ctx.actor.name}, ${ctx.actor.kind}, ${at})
		ON CONFLICT DO NOTHING
		RETURNING ${iso(sql`created_at`)} AS linked_at
	`);
	if (created.rows.length > 0) await announceLink(ctx, tx, { ticket, row: stored!, at });
	const [linked] = await rows<LinkRow & { linked_at: string }>(
		tx,
		sql`
			SELECT ${prColumns}, l.source, l.actor_name, l.actor_kind, ${iso(sql`l.created_at`)} AS linked_at
			FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
			WHERE l.ticket_id = ${ticket.id} AND l.pull_request_id = ${stored!.id}
		`,
	);
	return toLinked(linked!, linked!.linked_at);
};

const announceLink = async (ctx: ServiceCtx, tx: Tx, input: { ticket: TicketRow; row: PrRow; at: Date }) => {
	await touchTicket(tx, { id: input.ticket.id, at: input.at, versionStep: 0 });
	await writeActivity(ctx, tx, {
		ticket: input.ticket,
		action: "pr.linked",
		meta: { pullRequestId: input.row.id, url: input.row.url },
		at: input.at,
	});
	ctx.emit({
		type: "pr.linked",
		id: input.row.id,
		ticketIds: await linkedTicketIds(tx, input.row.id),
		state: input.row.state,
		ciState: input.row.ci_state,
	});
};

export type UnlinkInput = { ticket: string; id: string };

export const unlink = async (ctx: ServiceCtx, tx: Tx, input: UnlinkInput) => {
	const ticket = await resolveTicket(tx, input.ticket);
	const row = await findRow(tx, input.id);
	const dropped = await tx.execute(sql`
		DELETE FROM ticket_pull_requests WHERE ticket_id = ${ticket.id} AND pull_request_id = ${row.id} RETURNING ticket_id
	`);
	if (dropped.rows.length === 0) throw notFound("pullRequest", input.id);
	const ticketIds = await linkedTicketIds(tx, row.id);
	if (ticketIds.length === 0) await tx.execute(sql`DELETE FROM pull_requests WHERE id = ${row.id}`);
	const at = ctx.now();
	await touchTicket(tx, { id: ticket.id, at, versionStep: 0 });
	await writeActivity(ctx, tx, {
		ticket,
		action: "pr.unlinked",
		meta: { pullRequestId: row.id, url: row.url },
		at,
	});
	ctx.emit({ type: "pr.unlinked", id: row.id, ticketIds, state: row.state, ciState: row.ci_state });
	return { deleted: row.id };
};

export type IdInput = { id: string };

export const refresh = async (ctx: ServiceCtx, tx: Tx, input: IdInput): Promise<PullRequest> => {
	const row = await findRow(tx, input.id);
	const result = await fetchPullRequests(
		ctx.gh,
		[{ owner: row.owner, repo: row.repo, number: row.number }],
		"interactive",
	);
	if (!result.ok) throw fail("GH_UNAVAILABLE", { reason: result.reason });
	const first = result.results[0]!;
	const at = ctx.now();
	if (!("row" in first)) {
		await tx.execute(
			sql`UPDATE pull_requests SET fetch_error = ${first.error}, fetched_at = ${at} WHERE id = ${row.id}`,
		);
		return toPullRequest(await findRow(tx, row.id));
	}
	if (first.row.contentHash === row.content_hash) {
		await tx.execute(sql`UPDATE pull_requests SET fetched_at = ${at}, fetch_error = NULL WHERE id = ${row.id}`);
		return toPullRequest(await findRow(tx, row.id));
	}
	await writeFetched(tx, at, first.row);
	const fresh = await findRow(tx, row.id);
	ctx.emit({
		type: "pr.updated",
		id: fresh.id,
		ticketIds: await linkedTicketIds(tx, fresh.id),
		state: fresh.state,
		ciState: fresh.ci_state,
	});
	return toPullRequest(fresh);
};

export const diff = async (ctx: ServiceCtx, tx: Tx, input: IdInput): Promise<PullRequestDiffOutput> => {
	const row = await findRow(tx, input.id);
	const at = ctx.now().getTime();
	const cached = diffCache.get(row.id);
	if (cached !== undefined && at - cached.at < DIFF_CACHE_MS) return cached.value;
	const result = await fetchDiff(ctx.gh, row.url);
	if (!result.ok) throw fail("GH_UNAVAILABLE", { reason: result.reason });
	const value = { diff: result.diff, truncated: result.truncated, url: result.url };
	diffCache.set(row.id, { at, value });
	return value;
};

export type ListInput = { ticket: string };

export const list = async (ctx: ServiceCtx, tx: Tx, input: ListInput): Promise<LinkedPullRequest[]> => {
	const ticket = await resolveTicket(tx, input.ticket);
	const found = await rows<LinkRow & { linked_at: string }>(
		tx,
		sql`
			SELECT ${prColumns}, l.source, l.actor_name, l.actor_kind, ${iso(sql`l.created_at`)} AS linked_at
			FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
			WHERE l.ticket_id = ${ticket.id}
			ORDER BY l.created_at DESC, p.id DESC
		`,
	);
	return found.map((row) => toLinked(row, row.linked_at));
};
