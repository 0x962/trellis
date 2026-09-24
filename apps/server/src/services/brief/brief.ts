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
	const lines = ["## Diffs", ""];
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

const sections = (parts: string[][]) => parts.filter((part) => part.length > 0).map((part) => part.join("\n"));

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
		["Complete this assigned ticket. Record the result."],
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
		flowLines(await listFlows(tx, row.projectId)),
		chainLines(ticket, waitsOn),
		...(epic === null ? [] : epicLines(epic, ticket.id)),
		results,
		subTickets(ticket),
		pullRequests(ticket),
		attachments(ticket, ctx.publicUrl),
		notesLines(await activeNotes(ctx, tx, { projectId: row.projectId, audience: "worker" }), ticket.project.key),
	]).join("\n\n");
	return { markdown: `${markdown}\n`, generatedAt: new Date().toISOString() };
};
