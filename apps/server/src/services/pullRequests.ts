import type { LinkedPullRequest, PullRequest, PullRequestDiffOutput } from "@trellis/api";
import { reviewRef } from "@trellis/api/client";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { actorDisplayName } from "../db/queries/actorDisplayName.ts";
import { blobShasOfPullRequest } from "../db/queries/prEvidence.ts";
import {
	type LinkedPullRequestRow,
	type PullRequestRow,
	pullRequestColumns,
	toLinkedPullRequest,
	toPullRequest,
} from "../db/queries/pullRequestRows.ts";
import { iso, rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { invalidInput } from "../errors.ts";
import {
	fetchPullRequests,
	type PullRequestRow as GraphqlPullRequestRow,
	type PullRequestRef,
	type PullRequestResult,
} from "../gh/graphql.ts";
import { parsePullRequestUrl } from "../gh/parse.ts";
import { PR_COLUMNS, PR_UPDATE_SET, prValues } from "../gh/pollerWrite.ts";
import { gcBlobs } from "./blobs.ts";
import { findPullRequestRow } from "./findPullRequestRow.ts";
import type { PreparedDiff } from "./pullRequestDiff.ts";
import { linkScope } from "./pullRequestScope.ts";
import {
	assertProjectActive,
	fail,
	notFound,
	type PrepareCtx,
	resolveTicket,
	type ServiceCtx,
	type TicketRow,
	touchActor,
	touchTicket,
	writeActivity,
} from "./support.ts";

// One pull request is one row, whatever number of tickets link it. The link
// row carries the actor who linked it.
// pull_requests.review_retained keeps the PR after its last ticket link leaves.
//
// prepareLink and prepareRefresh read one pull request through the same gh
// query the poller runs for 50, before the service transaction opens, so no
// other call waits for gh. link stores what gh returned, or the gh message
// when gh is away, so a ticket keeps the link either way. refresh reports
// GH_UNAVAILABLE instead, because the caller asked for fresh fields.

export { prepareDiff } from "./pullRequestDiff.ts";
export { parsePullRequestUrl };

// The caller verifies `headSha` with GitHub before this transaction starts.
// This update stores that verified SHA before the caller writes head-specific data.
export const setHeadSha = (tx: Tx, input: { id: string; headSha: string }) =>
	tx.execute(sql`UPDATE pull_requests SET head_sha = ${input.headSha} WHERE id = ${input.id}`);

export const announcePullRequestUpdate = async (ctx: ServiceCtx, tx: Tx, row: PullRequestRow) => {
	const scope = await linkScope(tx, row.id);
	if (scope.ticketIds.length > 0)
		await tx.execute(sql`UPDATE tickets SET version = version + 1 WHERE id = ANY(${textArray(scope.ticketIds)})`);
	ctx.emit({ type: "pr.updated", id: row.id, ...scope, state: row.state, ciState: row.ci_state });
};

export const resolve = async (_ctx: ServiceCtx, tx: Tx, input: { ref: string }) => {
	if (/^\d+$/.test(input.ref)) {
		const found = await rows<{ id: string; url: string }>(
			tx,
			sql`SELECT id, url FROM pull_requests WHERE number = ${Number(input.ref)} ORDER BY owner, repo, id`,
		);
		if (found.length === 0) throw notFound("pull request", input.ref);
		if (found.length > 1)
			throw invalidInput(
				"ref",
				`Pull request ${input.ref} matches more than one repository. Use owner/repo#${input.ref}.`,
			);
		return found[0]!;
	}
	let ref: ReturnType<typeof reviewRef>;
	try {
		ref = reviewRef(input.ref);
	} catch {
		throw invalidInput("ref", "Use a GitHub PR URL or owner/repo#123.");
	}
	const [found] = await rows<{ id: string; url: string }>(
		tx,
		sql`SELECT id, url FROM pull_requests WHERE owner = ${ref.owner} AND repo = ${ref.repo} AND number = ${ref.number}`,
	);
	if (found === undefined) throw notFound("pull request", `${ref.owner}/${ref.repo}#${ref.number}`);
	return found;
};

// The fields gh returned, or the message it printed. A message is stored on
// the row, so the web shows why the fields are stale.
type Fetched = { row: GraphqlPullRequestRow } | { error: string };

const fetchOne = async (ctx: PrepareCtx, ref: PullRequestRef): Promise<Fetched> => {
	const result = await fetchPullRequests(ctx.gh, [ref], "interactive");
	if (!result.ok) return { error: result.message };
	const first = result.results[0]!;
	return "row" in first ? { row: first.row } : { error: first.error };
};

// A row whose content hash matches the fetch is left as it is, so a second
// link of one URL answers the same row, stamps included.
const writeFetched = (tx: Tx, at: Date, row: GraphqlPullRequestRow) =>
	tx.execute(sql`
	INSERT INTO pull_requests ${PR_COLUMNS}
	VALUES ${prValues(at, row)}
	ON CONFLICT (owner, repo, number) DO UPDATE SET ${PR_UPDATE_SET}
	WHERE pull_requests.content_hash IS DISTINCT FROM EXCLUDED.content_hash
`);

// A pull request gh could not answer for still gets a row, so the link
// survives. Its size fields stay null until a later request succeeds.
const writeUnfetched = (tx: Tx, at: Date, ref: PullRequestRef, url: string, error: string) =>
	tx.execute(sql`
	INSERT INTO pull_requests (id, owner, repo, number, url, state, fetch_error, created_at, updated_at)
	VALUES (${ulid()}, ${ref.owner}, ${ref.repo}, ${ref.number}, ${url}, 'open', ${error}, ${at}, ${at})
	ON CONFLICT (owner, repo, number) DO UPDATE SET fetch_error = EXCLUDED.fetch_error
`);

export type LinkInput = { ticket: string; url: string };

// The link input with the ref its URL names and what gh returned for it.
export type PreparedLink = LinkInput & { ref: PullRequestRef; fetched: Fetched };

// The URL and the ticket are checked before gh runs, so a refused link
// spawns no process.
export const prepareLink = async (ctx: PrepareCtx, input: LinkInput): Promise<PreparedLink> => {
	const ref = parsePullRequestUrl(input.url);
	if (ref === null) throw fail("INVALID_PR_URL");
	await ctx.newTx(async (tx) => assertProjectActive(await resolveTicket(tx, input.ticket)));
	return { ...input, ref, fetched: await fetchOne(ctx, ref) };
};

// The ticket is checked again, because it can change while gh runs.
export const link = async (ctx: ServiceCtx, tx: Tx, input: PreparedLink): Promise<LinkedPullRequest> => {
	const { ref, fetched } = input;
	const ticket = await resolveTicket(tx, input.ticket);
	assertProjectActive(ticket);
	const at = ctx.now();
	if ("row" in fetched) await writeFetched(tx, at, fetched.row);
	else await writeUnfetched(tx, at, ref, input.url, fetched.error);
	const [stored] = await rows<PullRequestRow>(
		tx,
		sql`SELECT ${pullRequestColumns} FROM pull_requests p WHERE p.owner = ${ref.owner} AND p.repo = ${ref.repo} AND p.number = ${ref.number}`,
	);
	await touchActor(tx, ctx.actor, at);
	const created = await tx.execute(sql`
		INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket.id}, ${stored!.id}, 'manual', ${ctx.actor.name}, ${ctx.actor.kind}, ${at})
		ON CONFLICT DO NOTHING
		RETURNING ${iso(sql`created_at`)} AS linked_at
	`);
	if (created.rows.length > 0) await announceLink(ctx, tx, { ticket, row: stored!, at });
	const [linked] = await rows<LinkedPullRequestRow & { linked_at: string }>(
		tx,
		sql`
			SELECT ${pullRequestColumns}, l.source, l.actor_name, l.actor_kind, ${actorDisplayName(sql`l.actor_name`, sql`l.actor_kind`)} AS actor_display_name, ${iso(sql`l.created_at`)} AS linked_at
			FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
			WHERE l.ticket_id = ${ticket.id} AND l.pull_request_id = ${stored!.id}
		`,
	);
	return toLinkedPullRequest(linked!, linked!.linked_at);
};

const announceLink = async (ctx: ServiceCtx, tx: Tx, input: { ticket: TicketRow; row: PullRequestRow; at: Date }) => {
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
		...(await linkScope(tx, input.row.id)),
		state: input.row.state,
		ciState: input.row.ci_state,
	});
};

export type UnlinkInput = { ticket: string; id: string };

export const unlink = async (ctx: ServiceCtx, tx: Tx, input: UnlinkInput) => {
	const ticket = await resolveTicket(tx, input.ticket);
	assertProjectActive(ticket);
	const row = await findPullRequestRow(tx, input.id);
	const dropped = await tx.execute(sql`
		DELETE FROM ticket_pull_requests WHERE ticket_id = ${ticket.id} AND pull_request_id = ${row.id} RETURNING ticket_id
	`);
	if (dropped.rows.length === 0) throw notFound("pullRequest", input.id);
	const scope = await linkScope(tx, row.id);
	if (scope.ticketIds.length === 0) {
		const blobs = await blobShasOfPullRequest(tx, row.id);
		const removed = await tx.execute(
			sql`DELETE FROM pull_requests WHERE id = ${row.id} AND NOT review_retained RETURNING id`,
		);
		if (removed.rows.length > 0 && blobs.length > 0)
			ctx.afterCommit(async () => {
				await gcBlobs(ctx, blobs);
			});
	}
	const at = ctx.now();
	await touchTicket(tx, { id: ticket.id, at, versionStep: 0 });
	await writeActivity(ctx, tx, {
		ticket,
		action: "pr.unlinked",
		meta: { pullRequestId: row.id, url: row.url },
		at,
	});
	// The event names the ticket the link left too, so its viewers drop the pull request.
	const ticketIds = [ticket.id, ...scope.ticketIds];
	const projectIds = [...new Set([ticket.project_id, ...scope.projectIds])];
	ctx.emit({ type: "pr.unlinked", id: row.id, ticketIds, projectIds, state: row.state, ciState: row.ci_state });
	return { deleted: row.id };
};

export type IdInput = { id: string };

// The pull request id with the gh answer for it.
export type PreparedRefresh = { id: string; first: PullRequestResult };

export const prepareRefresh = async (ctx: PrepareCtx, input: IdInput): Promise<PreparedRefresh> => {
	const row = await ctx.newTx((tx) => findPullRequestRow(tx, input.id));
	const ref = { owner: row.owner, repo: row.repo, number: row.number };
	const result = await fetchPullRequests(ctx.gh, [ref], "interactive");
	if (!result.ok) throw fail("GH_UNAVAILABLE", { reason: result.reason });
	return { id: row.id, first: result.results[0]! };
};

export const refresh = async (ctx: ServiceCtx, tx: Tx, input: PreparedRefresh): Promise<PullRequest> => {
	const row = await findPullRequestRow(tx, input.id);
	const { first } = input;
	const at = ctx.now();
	if (!("row" in first)) {
		await tx.execute(
			sql`UPDATE pull_requests SET fetch_error = ${first.error}, fetched_at = ${at} WHERE id = ${row.id}`,
		);
		return toPullRequest(await findPullRequestRow(tx, row.id));
	}
	if (first.row.contentHash === row.content_hash) {
		await tx.execute(sql`UPDATE pull_requests SET fetched_at = ${at}, fetch_error = NULL WHERE id = ${row.id}`);
		return toPullRequest(await findPullRequestRow(tx, row.id));
	}
	await writeFetched(tx, at, first.row);
	const fresh = await findPullRequestRow(tx, row.id);
	ctx.emit({
		type: "pr.updated",
		id: fresh.id,
		...(await linkScope(tx, fresh.id)),
		state: fresh.state,
		ciState: fresh.ci_state,
	});
	return toPullRequest(fresh);
};

// prepareDiff read the diff from gh. The row is read again, so a pull
// request that went while gh ran is NOT_FOUND.
export const diff = async (ctx: ServiceCtx, tx: Tx, input: PreparedDiff): Promise<PullRequestDiffOutput> => {
	await findPullRequestRow(tx, input.id);
	return input.value;
};

export type ListInput = { ticket: string };

export const list = async (ctx: ServiceCtx, tx: Tx, input: ListInput): Promise<LinkedPullRequest[]> => {
	const ticket = await resolveTicket(tx, input.ticket);
	const found = await rows<LinkedPullRequestRow & { linked_at: string }>(
		tx,
		sql`
			SELECT ${pullRequestColumns}, l.source, l.actor_name, l.actor_kind, ${actorDisplayName(sql`l.actor_name`, sql`l.actor_kind`)} AS actor_display_name, ${iso(sql`l.created_at`)} AS linked_at
			FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
			WHERE l.ticket_id = ${ticket.id}
			ORDER BY l.created_at DESC, p.id DESC
		`,
	);
	return found.map((row) => toLinkedPullRequest(row, row.linked_at));
};
