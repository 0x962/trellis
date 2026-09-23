import { type Brief, BriefGetInputSchema, type Epic, type Ticket } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { chainRows } from "../../db/queries/chainRows.ts";
import { rows, textArray } from "../../db/queries/support.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { epicView } from "../epics/epics.ts";
import { earlierResults, epicHeaderLine, epicLines, resultsLines, waveHeaderLine } from "../epics/text.ts";
import { listFlows } from "../flows/queries.ts";
import { activeNotes } from "../notes/notes.ts";
import { notesLines } from "../notes/text.ts";
import { resolveTicket } from "../refs.ts";
import { chainLines } from "./chainLines.ts";
import { contractLines } from "./contractLines.ts";
import { evidenceLines } from "./evidenceLines.ts";
import { flowLines } from "./flowLines.ts";

// The markdown an agent starts from. The layout is fixed and every list
// keeps a stable order, so two reads of the same state give the same bytes
// and an agent can parse the sections.

// Every link in a brief is absolute, because the agent reads it outside a
// browser. `ctx.publicUrl` carries the origin, which TRELLIS_PUBLIC_URL sets
// and which defaults to the loopback address and the port of the server.

// The outcome sentence of each ticket of `ticketIds` that records one, by
// ticket id. One statement reads every ticket.
const outcomes = async (tx: Tx, ticketIds: string[]) => {
	const found = await rows<{ id: string; outcome: string }>(
		tx,
		sql`SELECT id, outcome FROM tickets WHERE id = ANY(${textArray(ticketIds)}) AND outcome <> ''`,
	);
	return new Map(found.map((ticket) => [ticket.id, ticket.outcome]));
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
		`- Project: ${ticket.project.key}`,
		`- Status: ${ticket.status.name}`,
		`- Priority: ${ticket.priority}`,
		`- Labels: ${labelLine(ticket)}`,
	];
	if (ticket.parent !== null) lines.push(`- Parent: ${ticket.parent.identifier} ${parentTitle}`);
	if (epic !== null) lines.push(epicHeaderLine(epic));
	const wave = epic?.waves.find((candidate) => candidate.id === ticket.wave?.id);
	if (wave !== undefined) lines.push(waveHeaderLine(wave));
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

const protocol = (identifier: string) => [
	"## Protocol",
	"",
	"Work on the branch named above. Use the trellis CLI to report progress:",
	"",
	`- Start: trellis move ${identifier} in-progress`,
	`- Open a normal pull request on GitHub and link it: trellis pr add ${identifier} <url>.`,
	"  It waits in Trellis until you ask for review.",
	"- When the work is complete and you want the person to review it, run: trellis ready <pr>",
	`- Split the work: trellis sub ${identifier} -t "..."`,
	"",
	"Before you ask for a review, link your pull request. The ticket page and the reviewers see only a linked pull request.",
	"",
	"Before you end a turn, run trellis review list <pr-url>. Answer every review thread.",
	"",
	`When your work is ready for review, run: trellis move ${identifier} agent-review`,
	"",
	"Report what you did in your final message and in the pull request description. A person reads both.",
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
	`Before you start, read the ticket with its pull requests and the project notes: trellis brief ${identifier}`,
	"If a UI task needs Vite, start a scratch Trellis server under `$TMPDIR/trellis-*`.",
	"Set `TRELLIS_DEV_API` to that server.",
	"Stop the scratch server before you finish.",
	"Do not point Vite at the live host.",
];

const sections = (parts: string[][]) => parts.filter((part) => part.length > 0).map((part) => part.join("\n"));

// This text is the first prompt of an agent that trellis assigns to a ticket.
// `reserve` in `agentRuns/reserve.ts` builds this text once and saves it in
// `agent_runs.instruction`. A run keeps that saved text for its whole life.
// The pull requests and the project notes change while the agent works, so a
// saved copy of them goes out of date. The lines from `assignment` tell the
// agent to read their current state with `trellis brief`. `branch` is the
// branch of the Git worktree that `nativeWorkspace` creates for the run.
export const assignmentInstruction = (input: {
	identifier: string;
	title: string;
	description: string;
	projectKey: string;
	branch: string;
	publicUrl: string;
}) =>
	sections([
		[
			`# ${input.identifier}: ${input.title}`,
			"",
			`- Project: ${input.projectKey}`,
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
	const waitsOn = await chainRows(tx, ticket.id);
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
					await outcomes(
						tx,
						doneBefore.map((done) => done.id),
					),
				);
	const markdown = sections([
		header(ticket, parentTitle, epic, ctx.publicUrl),
		["## Description", "", ticket.description],
		contractLines(ticket.contract),
		evidenceLines,
		flowLines(await listFlows(tx, row.projectId)),
		chainLines(ticket, waitsOn),
		...(epic === null ? [] : epicLines(epic, ticket.id)),
		results,
		subTickets(ticket),
		pullRequests(ticket),
		attachments(ticket, ctx.publicUrl),
		notesLines(await activeNotes(ctx, tx, { projectId: row.projectId, audience: "worker" }), ticket.project.key),
		protocol(ticket.identifier),
		reviewComments,
	]).join("\n\n");
	return { markdown: `${markdown}\n`, generatedAt: new Date().toISOString() };
};
