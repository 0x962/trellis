import type {
	Attachment,
	LinkedPullRequest,
	StoredActorKind,
	Ticket,
	TicketContract,
	TicketSummary,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { actorDisplayName } from "./actorDisplayName.ts";
import { answeredQuestions } from "./answeredQuestion.ts";
import { type LinkedPullRequestRow, pullRequestColumns, toLinkedPullRequest } from "./pullRequestRows.ts";
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

// The tickets of one epic, in number order.
export const epicSummaries = (tx: Tx, epicId: string) =>
	summariesOf(
		tx,
		sql`page AS (SELECT c.id, row_number() OVER (ORDER BY c.number) AS rn FROM tickets c WHERE c.epic_id = ${epicId})`,
	);

// The pull requests linked to one ticket, oldest link first.
export const linkedPullRequests = async (tx: Tx, ticketId: string): Promise<LinkedPullRequest[]> => {
	const found = await rows<LinkedPullRequestRow & { linked_at: string }>(
		tx,
		sql`SELECT ${pullRequestColumns},
			l.source, l.actor_name, l.actor_kind, ${actorDisplayName(sql`l.actor_name`, sql`l.actor_kind`)} AS actor_display_name, ${iso(sql`l.created_at`)} AS linked_at
		FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
		WHERE l.ticket_id = ${ticketId}
		ORDER BY l.created_at, p.id`,
	);
	return found.map((row) => toLinkedPullRequest(row, row.linked_at));
};

type RawAttachment = {
	id: string;
	ticket_id: string;
	filename: string;
	mime: string;
	size: number;
	sha256: string;
	actor_name: string;
	actor_display_name: string | null;
	actor_kind: StoredActorKind;
	created_at: string;
};

// The route that serves the bytes of an attachment.
export const attachmentUrl = (id: string) => `/api/attachments/${id}/file`;

// The attachments of one ticket, oldest first.
export const attachmentsOf = async (tx: Tx, ticketId: string): Promise<Attachment[]> => {
	const found = await rows<RawAttachment>(
		tx,
		sql`SELECT a.id, a.ticket_id, a.filename, a.mime, a.size, a.sha256, a.actor_name, a.actor_kind, ${actorDisplayName(sql`a.actor_name`, sql`a.actor_kind`)} AS actor_display_name,
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
		actor: {
			name: row.actor_name,
			kind: row.actor_kind,
			...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
		},
		createdAt: row.created_at,
		url: attachmentUrl(row.id),
	}));
};

// The caller resolved the id, so the row exists.
export const ticketGet = async (tx: Tx, id: string): Promise<Ticket> => {
	const summary = await ticketSummary(tx, id);
	const detail = (
		await rows<
			TicketContract & {
				description: string;
				outcome: string;
			}
		>(
			tx,
			sql`SELECT description, result, files, leave_alone AS "leaveAlone", verify,
		review_focus AS "reviewFocus", outcome FROM tickets WHERE id = ${id}`,
		)
	)[0]!;
	return {
		...summary,
		description: detail.description,
		contract: {
			result: detail.result,
			files: detail.files,
			leaveAlone: detail.leaveAlone,
			verify: detail.verify,
			reviewFocus: detail.reviewFocus,
		},
		outcome: detail.outcome,
		answeredQuestions: await answeredQuestions(tx, id),
		children: await childSummaries(tx, id),
		prs: await linkedPullRequests(tx, id),
		attachments: await attachmentsOf(tx, id),
	};
};
