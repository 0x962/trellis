import type { AgentInboxOutput, AgentRole } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import type { CliContext } from "../context.ts";
import { compact, contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { type Column, cell, heading, json, printList, printRecord, renderTable, ticketList } from "../output.ts";
import { sessionRecord } from "./agentsOutput.ts";
import { off, on, status } from "./agentsSettings.ts";

type InboxEvent = AgentInboxOutput["events"][number];
type InboxComment = AgentInboxOutput["comments"][number];

// A TTY gets the events, the new comments, and the cursor. An event names
// its ticket by id; the summaries in the same answer give the identifier.
const printInboxTable = (ctx: CliContext, inbox: AgentInboxOutput) => {
	const identifiers = new Map(inbox.tickets.map((ticket) => [ticket.id, ticket.identifier]));
	const ticketOf = (id: string | null) => cell(id === null ? null : identifiers.get(id));
	const events: Column<InboxEvent>[] = [
		{ name: "id", value: (row) => String(row.id) },
		{ name: "ticket", value: (row) => ticketOf(row.ticketId) },
		{ name: "actor", value: (row) => `${row.actor.kind}:${row.actor.name}` },
		{ name: "action", value: (row) => row.action },
		{
			name: "change",
			value: (row) =>
				row.field === null ? "-" : cell(`${row.field}: ${row.fromValue ?? "-"} -> ${row.toValue ?? "-"}`),
		},
	];
	const comments: Column<InboxComment>[] = [
		{ name: "ticket", value: (row) => ticketOf(row.ticketId) },
		{ name: "actor", value: (row) => `${row.actor.kind}:${row.actor.name}` },
		{ name: "body", value: (row) => cell(row.body) },
	];
	const { color } = ctx.format;
	ctx.out.write(`${heading(`events (${inbox.events.length})`, color)}${renderTable(inbox.events, events)}\n`);
	ctx.out.write(`${heading(`comments (${inbox.comments.length})`, color)}${renderTable(inbox.comments, comments)}\n`);
	ctx.out.write(`cursor ${inbox.cursor}, more ${inbox.more ? "yes" : "no"}\n`);
};

const inbox = defineCommand({
	meta: { name: "inbox", description: "Read the changes after the manager's cursor and advance the cursor" },
	args: { project: { type: "string", required: true, description: "Project ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).agents.inbox({ project: context.args.project });
		switch (ctx.format.mode) {
			case "json":
			case "jsonl":
				ctx.out.write(json(result));
				return;
			case "quiet":
				printList(ctx.out, ctx.format, result.tickets, ticketList);
				return;
			case "table":
				printInboxTable(ctx, result);
				return;
		}
	},
});

// A flag wins over the variable that a Superset terminal or Claude Code
// sets. A value from neither stops the run before any request.
const flagOrEnv = (ctx: CliContext, flag: string, value: string | undefined, variable: string): string => {
	const found = value ?? ctx.deps.env[variable];
	if (found === undefined || found === "") throw usageError(`${flag} needs a value, or set ${variable}`);
	return found;
};

const register = defineCommand({
	meta: { name: "register", description: "Record the session of this agent" },
	args: {
		role: { type: "enum", options: ["manager", "builder", "reviewer"], required: true, description: "Agent role" },
		project: { type: "string", required: true, description: "Project ref" },
		ticket: { type: "string", description: "Ticket ref, for a builder or a reviewer" },
		workspace: { type: "string", description: "Superset workspace id (default SUPERSET_WORKSPACE_ID)" },
		terminal: { type: "string", description: "Superset terminal id (default SUPERSET_TERMINAL_ID)" },
		"claude-session": { type: "string", description: "Claude Code session id (default CLAUDE_CODE_SESSION_ID)" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const workspaceId = flagOrEnv(ctx, "--workspace", args.workspace, "SUPERSET_WORKSPACE_ID");
		const terminalId = flagOrEnv(ctx, "--terminal", args.terminal, "SUPERSET_TERMINAL_ID");
		const claudeSessionId = flagOrEnv(ctx, "--claude-session", args["claude-session"], "CLAUDE_CODE_SESSION_ID");
		const session = await clientOf(ctx).agents.register(
			compact({
				role: args.role as AgentRole,
				project: args.project,
				ticket: args.ticket,
				workspaceId,
				terminalId,
				claudeSessionId,
			}),
		);
		printRecord(ctx.out, ctx.format, session, sessionRecord);
	},
});

const start = defineCommand({
	meta: { name: "start", description: "Start a builder agent for a ticket" },
	args: { ticket: { type: "positional", required: true, description: "Ticket ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const session = await clientOf(ctx).agents.startBuilder({ ticket: context.args.ticket });
		printRecord(ctx.out, ctx.format, session, sessionRecord);
	},
});

const review = defineCommand({
	meta: { name: "review", description: "Start a reviewer agent for a ticket's pull request" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		pr: { type: "string", required: true, description: "Pull request URL" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const session = await clientOf(ctx).agents.startReviewer({ ticket: args.ticket, prUrl: args.pr });
		printRecord(ctx.out, ctx.format, session, sessionRecord);
	},
});

const stop = defineCommand({
	meta: { name: "stop", description: "Stop an agent session" },
	args: { session: { type: "positional", required: true, description: "Session id" } },
	async run(context) {
		const ctx = contextOf(context);
		const session = await clientOf(ctx).agents.stop({ id: context.args.session });
		printRecord(ctx.out, ctx.format, session, sessionRecord);
	},
});

export default defineCommand({
	meta: { name: "agents", description: "Start, stop, and list agents; read the manager inbox" },
	subCommands: { inbox, register, start, review, status, stop, on, off },
});
