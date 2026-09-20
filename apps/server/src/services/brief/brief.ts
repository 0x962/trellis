import { type Brief, BriefGetInputSchema, type Epic, type StoredActorKind, type Ticket } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows, textArray } from "../../db/queries/support.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { epicView } from "../epics/epics.ts";
import { earlierResults, epicHeaderLine, epicLines, milestoneHeaderLine, resultsLines } from "../epics/text.ts";
import { activeNotes } from "../notes/notes.ts";
import { notesLines } from "../notes/text.ts";
import { effectiveRepos } from "../projectsRepos.ts";
import { resolveTicket } from "../refs.ts";
import { chainLines } from "./chainLines.ts";
import { contractLines } from "./contractLines.ts";
import { evidenceOwedLines } from "./evidenceOwedLines.ts";

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
	actor_display_name: string | null;
	created_at: string;
};

// Each recent reply includes its root, so the agent can read the original question.
const lastComments = async (tx: Tx, ticketId: string) => {
	const found = await rows<BriefComment>(
		tx,
		sql`WITH recent AS (
			SELECT * FROM comments WHERE ticket_id = ${ticketId} ORDER BY created_at DESC, id DESC LIMIT ${BRIEF_COMMENT_LIMIT}
		)
		SELECT id, parent_id, ${iso(sql`resolved_at`)} AS resolved_at, body, actor_name, actor_kind, ${actorDisplayName(sql`comments.actor_name`, sql`comments.actor_kind`)} AS actor_display_name, ${iso(sql`created_at`)} AS created_at
		FROM comments WHERE id IN (SELECT id FROM recent UNION SELECT parent_id FROM recent WHERE parent_id IS NOT NULL)
		ORDER BY created_at, id`,
	);
	return found;
};

// The body of the last comment that an agent wrote on each ticket of
// `ticketIds`, by ticket id. One statement reads every ticket.
const lastAgentComments = async (tx: Tx, ticketIds: string[]) => {
	const found = await rows<{ ticket_id: string; body: string }>(
		tx,
		sql`SELECT DISTINCT ON (ticket_id) ticket_id, body FROM comments
			WHERE ticket_id = ANY(${textArray(ticketIds)}) AND actor_kind = 'agent'
			ORDER BY ticket_id, created_at DESC, id DESC`,
	);
	return new Map(found.map((comment) => [comment.ticket_id, comment.body]));
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

// The labels of the ticket, as `bug, type/feature`, and `none` for a ticket
// with no label. A label of a group prints the group name, a slash, and the
// label name, which is the form the CLI and the API take back as a ref.
const labelLine = (ticket: Ticket) => {
	if (ticket.labels.length === 0) return "none";
	return ticket.labels.map((label) => (label.group === null ? label.name : `${label.group}/${label.name}`)).join(", ");
};

const header = (ticket: Ticket, parentTitle: string | null, epic: Epic | null, publicUrl: string) => {
	const lines = [
		`# ${ticket.identifier}: ${ticket.title}`,
		"",
		`- Project: ${ticket.project.path}`,
		`- Status: ${ticket.status.name}`,
		`- Priority: ${ticket.priority}`,
		`- Labels: ${labelLine(ticket)}`,
	];
	if (ticket.parent !== null) lines.push(`- Parent: ${ticket.parent.identifier} ${parentTitle}`);
	if (epic !== null) lines.push(epicHeaderLine(epic));
	const milestone = epic?.milestones.find((candidate) => candidate.id === ticket.milestone?.id);
	if (milestone !== undefined) lines.push(milestoneHeaderLine(milestone));
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
		lines.push(
			`- ${comment.id}, ${context}, ${comment.actor_display_name ?? comment.actor_name} (${comment.actor_kind}) at ${comment.created_at}:`,
		);
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
	`- Link each pull request you open: trellis pr add ${identifier} <url>`,
	`- Split the work: trellis sub ${identifier} -t "..."`,
	"",
	"Before you ask for a review, link your pull request. The ticket page and the reviewers see only a linked pull request.",
	"",
	`When your work is ready for review, run: trellis move ${identifier} agent-review`,
];

const reviewComments = [
	"## Review comments",
	"",
	"Review comments for a pull request live in Trellis, not on GitHub. GitHub comments are for people.",
	"",
	"- Read the open review comments before you act on review feedback: trellis review list <pr-url>",
	'- Reply to a review comment: trellis review reply <thread-id> --body "..."',
	"- Resolve a review comment you addressed: trellis review resolve <thread-id>",
	'- Post a review comment: trellis review add <pr-url> --path <file> --line <n> --body "..."',
	"",
	"Never post your review comments on GitHub.",
];

const assignment = (identifier: string) => [
	"## Assignment",
	"",
	"Trellis is the ticket tracker on this machine. It assigned this ticket to you. Your worktree is on the branch named above.",
	`Before you start, read the ticket with its comments, its pull requests, and the project notes: trellis brief ${identifier}`,
];

const sections = (parts: string[][]) => parts.filter((part) => part.length > 0).map((part) => part.join("\n"));

// This text is the first prompt of an agent that trellis assigns to a ticket.
// `reserve` in `agentRuns/reserve.ts` builds this text once and saves it in
// `agent_runs.instruction`. A run keeps that saved text for its whole life.
// The comments, the pull requests, and the project notes change while the
// agent works, so a saved copy of them goes out of date. The lines from
// `assignment` tell the agent to read their current state with
// `trellis brief`. `branch` is the branch of the Git worktree that
// `nativeWorkspace` creates for the run.
export const assignmentInstruction = (input: {
	identifier: string;
	title: string;
	description: string;
	projectPath: string;
	branch: string;
	publicUrl: string;
}) =>
	sections([
		[
			`# ${input.identifier}: ${input.title}`,
			"",
			`- Project: ${input.projectPath}`,
			`- Branch: ${input.branch}`,
			`- URL: ${input.publicUrl}/t/${input.identifier}`,
		],
		input.description.trim() === "" ? [] : ["## Description", "", input.description.trimEnd()],
		assignment(input.identifier),
		protocol(input.identifier),
		reviewComments,
	]).join("\n\n");

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
	const epic = ticket.epic === null ? null : await epicView(ctx, tx, ticket.epic.id);
	const doneBefore = epic === null ? [] : earlierResults(epic, ticket.id).flatMap((group) => group.tickets);
	const results =
		epic === null || doneBefore.length === 0
			? []
			: resultsLines(
					epic,
					ticket.id,
					await lastAgentComments(
						tx,
						doneBefore.map((done) => done.id),
					),
				);
	const repos = await effectiveRepos(ctx, tx, { project: ticket.project.path });
	const repositoryName = repos.length === 1 ? repos[0]?.repo : undefined;
	const markdown = sections([
		header(ticket, parentTitle, epic, ctx.publicUrl),
		["## Description", "", ticket.description],
		contractLines(ticket.contract),
		evidenceOwedLines(ticket.contract, repositoryName),
		await chainLines(tx, ticket.id),
		...(epic === null ? [] : epicLines(epic, ticket.id)),
		results,
		subTickets(ticket),
		pullRequests(ticket),
		attachments(ticket, ctx.publicUrl),
		comments(await lastComments(tx, row.id)),
		notesLines(await activeNotes(ctx, tx, { projectId: row.projectId, audience: "worker" }), ticket.project.path),
		protocol(ticket.identifier),
		reviewComments,
	]).join("\n\n");
	return { markdown: `${markdown}\n`, generatedAt: new Date().toISOString() };
};
