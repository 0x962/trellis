import { type Brief, BriefGetInputSchema, type StoredActorKind, type Ticket } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import { iso, rows } from "../db/queries/support.ts";
import { ticketGet } from "../db/queries/ticketGet.ts";
import type { Tx } from "../db/tx.ts";
import { resolveTicket } from "./refs.ts";

// The markdown an agent starts from. The layout is fixed and every list
// keeps a stable order, so two reads of the same state give the same bytes
// and an agent can parse the sections.

// Every link in a brief is absolute, because the agent reads it outside a
// browser. `ctx.publicUrl` carries the origin, which TRELLIS_PUBLIC_URL sets
// and which defaults to the loopback address and the port of the server.

export const BRIEF_COMMENT_LIMIT = 10;

type BriefComment = {
	id: string;
	parent_id: string | null;
	resolved_at: string | null;
	body: string;
	actor_name: string;
	actor_kind: StoredActorKind;
	created_at: string;
};

// Each recent reply includes its root, so the agent can read the original question.
const lastComments = async (tx: Tx, ticketId: string) => {
	const found = await rows<BriefComment>(
		tx,
		sql`WITH recent AS (
			SELECT * FROM comments WHERE ticket_id = ${ticketId} ORDER BY created_at DESC, id DESC LIMIT ${BRIEF_COMMENT_LIMIT}
		)
		SELECT id, parent_id, ${iso(sql`resolved_at`)} AS resolved_at, body, actor_name, actor_kind, ${iso(sql`created_at`)} AS created_at
		FROM comments WHERE id IN (SELECT id FROM recent UNION SELECT parent_id FROM recent WHERE parent_id IS NOT NULL)
		ORDER BY created_at, id`,
	);
	return found;
};

// The branch an agent works on: the identifier in lower case and the title
// as a slug, cut at 40 characters.
export const branchName = (identifier: string, title: string) => {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");
	return slug === "" ? identifier.toLowerCase() : `${identifier.toLowerCase()}-${slug}`;
};

const header = (ticket: Ticket, parentTitle: string | null, publicUrl: string) => {
	const lines = [
		`# ${ticket.identifier}: ${ticket.title}`,
		"",
		`- Project: ${ticket.project.path}`,
		`- Status: ${ticket.status.name}`,
		`- Priority: ${ticket.priority}`,
	];
	if (ticket.parent !== null) lines.push(`- Parent: ${ticket.parent.identifier} ${parentTitle}`);
	lines.push(`- Branch: ${branchName(ticket.identifier, ticket.title)}`);
	lines.push(`- URL: ${publicUrl}/t/${ticket.identifier}`);
	return lines;
};

const subTickets = (ticket: Ticket) =>
	ticket.children.length === 0
		? []
		: [
				"## Sub-tickets",
				"",
				...ticket.children.map((child) => `- ${child.identifier} ${child.title} (${child.status.name})`),
			];

const pullRequests = (ticket: Ticket) => {
	if (ticket.prs.length === 0) return [];
	const lines = ["## Pull requests", ""];
	for (const pr of ticket.prs) {
		lines.push(`- ${pr.url} (${pr.state}, CI ${pr.ciState})`);
		const failing = pr.checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel");
		for (const check of failing) lines.push(`  - failing: ${check.name}`);
	}
	return lines;
};

const attachments = (ticket: Ticket, publicUrl: string) =>
	ticket.attachments.length === 0
		? []
		: ["## Attachments", "", ...ticket.attachments.map((file) => `- ${file.filename}: ${publicUrl}${file.url}`)];

// One list item per comment; a body of several lines is indented under it.
const comments = (list: BriefComment[]) => {
	if (list.length === 0) return [];
	const lines = ["## Comments", ""];
	for (const comment of list) {
		const context =
			comment.parent_id === null
				? comment.resolved_at === null
					? "open thread"
					: "resolved thread"
				: `reply to ${comment.parent_id}`;
		lines.push(`- ${comment.id}, ${context}, ${comment.actor_name} (${comment.actor_kind}) at ${comment.created_at}:`);
		for (const line of comment.body.split("\n")) lines.push(`  ${line}`);
	}
	return lines;
};

const protocol = (identifier: string) => [
	"## Protocol",
	"",
	"Work on the branch named above. Use the trellis CLI to report progress:",
	"",
	`- Start: trellis move ${identifier} in-progress`,
	`- Ask or report: trellis comment ${identifier} --body "..."`,
	`- Link your pull request: trellis pr add ${identifier} <url>`,
	`- Split the work: trellis sub ${identifier} -t "..."`,
	"",
	`When your work is ready for review, run: trellis move ${identifier} agent-review`,
	"Never move the ticket to done. A human does that after the review.",
];

const sections = (parts: string[][]) => parts.filter((part) => part.length > 0).map((part) => part.join("\n"));

export const get = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Brief> => {
	const input = BriefGetInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	const ticket = await ticketGet(tx, row.id);
	const parentTitle =
		ticket.parent === null
			? null
			: (
					(await rows<{ title: string }>(tx, sql`SELECT title FROM tickets WHERE id = ${ticket.parent.id}`))[0] as {
						title: string;
					}
				).title;
	const markdown = sections([
		header(ticket, parentTitle, ctx.publicUrl),
		["## Description", "", ticket.description],
		subTickets(ticket),
		pullRequests(ticket),
		attachments(ticket, ctx.publicUrl),
		comments(await lastComments(tx, row.id)),
		protocol(ticket.identifier),
	]).join("\n\n");
	return { markdown: `${markdown}\n`, generatedAt: new Date().toISOString() };
};
