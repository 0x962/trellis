import type { CiState, PrState } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { SYSTEM_ACTOR } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Emit, Tx } from "../db/tx.ts";
import type { PullRequestRow } from "./graphql.ts";
import type { DueRow } from "./pollerDue.ts";

// The poller writes a pull request row only when the content hash changed,
// so a fetch that finds the same fields costs no write and no event. A row
// that is written bumps the version of every ticket that links it, because a
// client caches a ticket by version. It leaves `updated_at` on the ticket,
// because no person acted.

// A ticket that links one pull request, with the project columns an
// activity row needs.
type LinkRow = { pull_request_id: string; ticket_id: string; root_id: string; project_id: string };

// The stored row of a pull request and the answer gh gave for it.
export type Polled = { stored: DueRow; row: PullRequestRow };

export type PolledFailure = { id: string; error: string };

export type WriteInput = { at: Date; written: Polled[]; failed: PolledFailure[] };

export const PR_COLUMNS = sql.raw(`(
	id, owner, repo, number, additions, deletions, changed_files, files, url, title, state, is_draft, is_queued, head_sha, head_ref, base_ref, mergeable, review_state,
	merged_at, closed_at, checks, checks_changed_at, ci_state, content_hash, fetched_at, fetch_error, created_at, updated_at
)`);

export const prValues = (at: Date, row: PullRequestRow) => sql`(
	${ulid()}, ${row.owner}, ${row.repo}, ${row.number}, ${row.additions}, ${row.deletions}, ${row.changedFiles},
	${JSON.stringify(row.files)}::jsonb,
	${row.url}, ${row.title}, ${row.state}, ${row.isDraft}, ${row.isQueued},
	${row.headSha}, ${row.headRef}, ${row.baseRef}, ${row.mergeable}, ${row.reviewState}, ${row.mergedAt}, ${row.closedAt},
	${JSON.stringify(row.checks)}::jsonb, ${at}, ${row.ciState}, ${row.contentHash}, ${at}, NULL, ${at}, ${at}
)`;

// `checks_changed_at` moves only when the checks or the head commit differ,
// because the check notice detector counts the quiet time from it.
//
// A new head commit clears `ready_for_review_at`. The explanation the agent
// wrote covers the old commit, so the person waits for nothing until the
// agent asks again, and the stored moment would measure a wait that ended.
export const PR_UPDATE_SET = sql.raw(`
	checks_changed_at = CASE
		WHEN pull_requests.checks IS DISTINCT FROM EXCLUDED.checks OR pull_requests.head_sha IS DISTINCT FROM EXCLUDED.head_sha
		THEN EXCLUDED.updated_at ELSE pull_requests.checks_changed_at END,
	ready_for_review_at = CASE
		WHEN pull_requests.head_sha IS DISTINCT FROM EXCLUDED.head_sha
		THEN NULL ELSE pull_requests.ready_for_review_at END,
	additions = EXCLUDED.additions, deletions = EXCLUDED.deletions, changed_files = EXCLUDED.changed_files,
	files = EXCLUDED.files,
	url = EXCLUDED.url, title = EXCLUDED.title, state = EXCLUDED.state, is_draft = EXCLUDED.is_draft,
	is_queued = EXCLUDED.is_queued,
	head_sha = EXCLUDED.head_sha,
	head_ref = EXCLUDED.head_ref, base_ref = EXCLUDED.base_ref, mergeable = EXCLUDED.mergeable, review_state = EXCLUDED.review_state,
	merged_at = EXCLUDED.merged_at, closed_at = EXCLUDED.closed_at, checks = EXCLUDED.checks,
	ci_state = EXCLUDED.ci_state, content_hash = EXCLUDED.content_hash, fetched_at = EXCLUDED.fetched_at,
	fetch_error = NULL, updated_at = EXCLUDED.updated_at
`);

const joined = (parts: SQL[]) => sql.join(parts, sql`, `);

// Writes the fetched fields of every pull request in one statement. A pull
// request that already has a row keeps its id, so every link to it stands.
export const upsertPullRequests = (tx: Tx, at: Date, prs: PullRequestRow[]) =>
	tx.execute(sql`
		INSERT INTO pull_requests ${PR_COLUMNS}
		VALUES ${joined(prs.map((row) => prValues(at, row)))}
		ON CONFLICT (owner, repo, number) DO UPDATE SET ${PR_UPDATE_SET}
	`);

// The message gh printed for one pull request it could not answer. The
// stored fields stay, so the web shows the old answer and says why it is
// old.
export const storeFetchErrors = (tx: Tx, failed: PolledFailure[]) =>
	tx.execute(sql`
		UPDATE pull_requests SET fetch_error = v.message
		FROM (VALUES ${joined(failed.map((entry) => sql`(${entry.id}::text, ${entry.error}::text)`))}) AS v(id, message)
		WHERE pull_requests.id = v.id
	`);

// Records that the system actor `trellis` acted. Every activity row points
// at the actors table, so this row exists before any of them.
export const touchSystemActor = (tx: Tx, at: Date) =>
	tx.execute(sql`
		INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${SYSTEM_ACTOR.name}, ${SYSTEM_ACTOR.kind}, ${at}, ${at})
		ON CONFLICT (name, kind) DO UPDATE SET last_seen_at = ${at}
	`);

export const linkedTickets = (tx: Tx, prIds: string[]) =>
	rows<LinkRow>(
		tx,
		sql`
			SELECT l.pull_request_id, t.id AS ticket_id, t.root_id, t.project_id
			FROM ticket_pull_requests l JOIN tickets t ON t.id = l.ticket_id
			WHERE l.pull_request_id = ANY(${textArray(prIds)})
			ORDER BY l.created_at, t.id
		`,
	);

const ticketsOf = (links: LinkRow[], prId: string) => links.filter((link) => link.pull_request_id === prId);

// `open/pass` names the pull request state and the ci state together, which
// is what the timeline line reads.
const label = (state: PrState, ciState: CiState) => `${state}/${ciState}`;

const moved = (entry: Polled) => entry.stored.state !== entry.row.state || entry.stored.ci_state !== entry.row.ciState;

const activityValues = (at: Date, entry: Polled, links: LinkRow[]) => {
	const batchId = ulid();
	const meta = JSON.stringify({
		pullRequestId: entry.stored.id,
		from: label(entry.stored.state, entry.stored.ci_state),
		to: label(entry.row.state, entry.row.ciState),
	});
	return ticketsOf(links, entry.stored.id).map(
		(link) => sql`(
			${batchId}, ${link.root_id}, ${link.project_id}, ${link.ticket_id},
			${SYSTEM_ACTOR.name}, ${SYSTEM_ACTOR.kind}, 'pr.state_changed', ${meta}::jsonb, ${at}
		)`,
	);
};

// One timeline row per linked ticket, for a pull request whose state or ci
// state moved. A title edit writes none: nobody wants a timeline line for it.
const writeStateChanges = async (tx: Tx, at: Date, changed: Polled[], links: LinkRow[]) => {
	const values = changed.flatMap((entry) => activityValues(at, entry, links));
	if (values.length === 0) return;
	await touchSystemActor(tx, at);
	await tx.execute(sql`
		INSERT INTO activity (batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, meta, created_at)
		VALUES ${joined(values)}
	`);
};

export const writePolled = async (tx: Tx, emit: Emit, input: WriteInput) => {
	if (input.failed.length > 0) await storeFetchErrors(tx, input.failed);
	if (input.written.length === 0) return;
	const prIds = input.written.map((entry) => entry.stored.id);
	await upsertPullRequests(
		tx,
		input.at,
		input.written.map((entry) => entry.row),
	);
	const links = await linkedTickets(tx, prIds);
	const ticketIds = [...new Set(links.map((link) => link.ticket_id))];
	if (ticketIds.length > 0) {
		await tx.execute(sql`UPDATE tickets SET version = version + 1 WHERE id = ANY(${textArray(ticketIds)})`);
	}
	await writeStateChanges(tx, input.at, input.written.filter(moved), links);
	for (const entry of input.written) {
		const linked = ticketsOf(links, entry.stored.id);
		emit({
			type: "pr.updated",
			id: entry.stored.id,
			ticketIds: linked.map((link) => link.ticket_id),
			projectIds: [...new Set(linked.map((link) => link.project_id))],
			state: entry.row.state,
			ciState: entry.row.ciState,
		});
	}
};
