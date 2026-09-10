import type { Attachment, LinkedPullRequest, StoredActorKind, Ticket, TicketSummary } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { iso, rows } from "./support.ts";
import { type SummaryRow, summaryStatement, toSummary } from "./ticketSummary.ts";

const summariesOf = async (tx: Tx, page: SQL) => {
	const found = await rows<SummaryRow>(tx, summaryStatement(page, sql``, sql`page.rn`));
	return found.map(toSummary);
};

// The summary of one ticket. The caller resolved the id, so the row exists.
export const ticketSummary = async (tx: Tx, id: string): Promise<TicketSummary> => {
	const found = await summariesOf(tx, sql`page AS (SELECT t.id, 1 AS rn FROM tickets t WHERE t.id = ${id})`);
	return found[0] as TicketSummary;
};

// The children of one ticket, in number order.
export const childSummaries = (tx: Tx, parentId: string) =>
	summariesOf(
		tx,
		sql`page AS (SELECT c.id, row_number() OVER (ORDER BY c.number) AS rn FROM tickets c WHERE c.parent_id = ${parentId})`,
	);

type RawLinkedPr = {
	id: string;
	owner: string;
	repo: string;
	number: number;
	url: string;
	title: string;
	state: LinkedPullRequest["state"];
	is_draft: boolean;
	head_ref: string;
	base_ref: string;
	review_state: LinkedPullRequest["reviewState"];
	merged_at: string | null;
	closed_at: string | null;
	checks: LinkedPullRequest["checks"];
	ci_state: LinkedPullRequest["ciState"];
	fetched_at: string | null;
	fetch_error: string | null;
	created_at: string;
	updated_at: string;
	source: LinkedPullRequest["source"];
	actor_name: string;
	actor_kind: StoredActorKind;
	linked_at: string;
};

// The pull requests linked to one ticket, oldest link first.
export const linkedPullRequests = async (tx: Tx, ticketId: string): Promise<LinkedPullRequest[]> => {
	const found = await rows<RawLinkedPr>(
		tx,
		sql`SELECT p.id, p.owner, p.repo, p.number, p.url, p.title, p.state, p.is_draft, p.head_ref, p.base_ref,
			p.review_state, ${iso(sql`p.merged_at`)} AS merged_at, ${iso(sql`p.closed_at`)} AS closed_at, p.checks,
			p.ci_state, ${iso(sql`p.fetched_at`)} AS fetched_at, p.fetch_error,
			${iso(sql`p.created_at`)} AS created_at, ${iso(sql`p.updated_at`)} AS updated_at,
			l.source, l.actor_name, l.actor_kind, ${iso(sql`l.created_at`)} AS linked_at
		FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
		WHERE l.ticket_id = ${ticketId}
		ORDER BY l.created_at, p.id`,
	);
	return found.map((row) => ({
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
		source: row.source,
		linkedBy: { name: row.actor_name, kind: row.actor_kind },
		linkedAt: row.linked_at,
	}));
};

type RawAttachment = {
	id: string;
	ticket_id: string;
	filename: string;
	mime: string;
	size: number;
	sha256: string;
	actor_name: string;
	actor_kind: StoredActorKind;
	created_at: string;
};

// The route that serves the bytes of an attachment.
export const attachmentUrl = (id: string) => `/api/attachments/${id}/file`;

// The attachments of one ticket, oldest first.
export const attachmentsOf = async (tx: Tx, ticketId: string): Promise<Attachment[]> => {
	const found = await rows<RawAttachment>(
		tx,
		sql`SELECT a.id, a.ticket_id, a.filename, a.mime, a.size, a.sha256, a.actor_name, a.actor_kind,
			${iso(sql`a.created_at`)} AS created_at
		FROM attachments a WHERE a.ticket_id = ${ticketId} ORDER BY a.created_at, a.id`,
	);
	return found.map((row) => ({
		id: row.id,
		ticketId: row.ticket_id,
		filename: row.filename,
		mime: row.mime,
		size: row.size,
		sha256: row.sha256,
		actor: { name: row.actor_name, kind: row.actor_kind },
		createdAt: row.created_at,
		url: attachmentUrl(row.id),
	}));
};

// The `tickets.get` shape: the summary, the description, the children, the
// pull requests, and the attachments. The caller resolved the id.
export const ticketGet = async (tx: Tx, id: string): Promise<Ticket> => {
	const summary = await ticketSummary(tx, id);
	const [row] = await rows<{ description: string }>(tx, sql`SELECT description FROM tickets WHERE id = ${id}`);
	return {
		...summary,
		description: (row as { description: string }).description,
		children: await childSummaries(tx, id),
		prs: await linkedPullRequests(tx, id),
		attachments: await attachmentsOf(tx, id),
	};
};
