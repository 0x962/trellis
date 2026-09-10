import type { AgentProjectSettings, AgentSettings, AgentsOverview } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import type { CliContext } from "../context.ts";
import { compact, contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { heading, json, printList, printRecord, renderTable } from "../output.ts";
import { actionColumns, batchColumns, sessionColumns, sessionList, settingsRecord } from "./agentsOutput.ts";

// A TTY gets one table per part of the overview, each under its count.
const printOverview = (ctx: CliContext, overview: AgentsOverview) => {
	const identifiers = new Map(overview.tickets.map((ticket) => [ticket.id, ticket.identifier]));
	const { color } = ctx.format;
	const part = <T>(title: string, rows: T[], columns: Parameters<typeof renderTable<T>>[1]) =>
		ctx.out.write(`${heading(`${title} (${rows.length})`, color)}${renderTable(rows, columns)}\n`);
	part("sessions", overview.sessions, sessionColumns);
	part("actions", overview.actions, actionColumns(identifiers));
	part("batches", overview.batches, batchColumns);
};

// `agents.sessions` takes one scope. Without a flag, the verb reads the
// overview: every session, the last writes of the agents, and the batches
// the dispatcher sent. The web reads the same answer on its Agents page.
export const status = defineCommand({
	meta: { name: "status", description: "List the agent sessions of a project, a ticket, or every project" },
	args: {
		project: { type: "string", description: "Project ref" },
		ticket: { type: "string", description: "Ticket ref" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { project, ticket } = context.args;
		if (project !== undefined && ticket !== undefined) throw usageError("pass --project or --ticket, not both");
		const client = clientOf(ctx);
		if (project === undefined && ticket === undefined) {
			const overview = await client.agents.overview();
			if (ctx.format.mode === "json") {
				ctx.out.write(json(overview));
				return;
			}
			if (ctx.format.mode === "table") {
				printOverview(ctx, overview);
				return;
			}
			printList(ctx.out, ctx.format, overview.sessions, sessionList);
			return;
		}
		const { sessions } = await client.agents.sessions(compact({ project, ticket }));
		if (ctx.format.mode === "json") {
			ctx.out.write(json({ sessions }));
			return;
		}
		printList(ctx.out, ctx.format, sessions, sessionList);
	},
});

// A project without a settings row gets the contract defaults. Without a
// base branch, each agent starts from the default branch of the project's
// Superset checkout.
const defaultRow = (projectId: string): AgentProjectSettings => ({
	projectId,
	enabled: false,
	supersetProjectId: null,
	baseBranch: null,
	maxConcurrent: 3,
	removeWorkspaceOnDone: true,
});

// `agents.setSettings` replaces the whole document, so the verb reads it,
// changes one switch, and writes every other field back unchanged.
const toggle = (enabled: boolean) =>
	defineCommand({
		meta: {
			name: enabled ? "on" : "off",
			description: `Turn the agents ${enabled ? "on" : "off"}, globally or for one project`,
		},
		args: { project: { type: "string", description: "Project ref; without it, the global switch" } },
		async run(context) {
			const ctx = contextOf(context);
			const client = clientOf(ctx);
			const settings = await client.agents.settings();
			let next: AgentSettings = { ...settings, enabled };
			if (context.args.project !== undefined) {
				const { id } = await client.projects.get({ project: context.args.project });
				const rows = settings.projects.some((row) => row.projectId === id)
					? settings.projects
					: [...settings.projects, defaultRow(id)];
				next = { ...settings, projects: rows.map((row) => (row.projectId === id ? { ...row, enabled } : row)) };
			}
			const saved = await client.agents.setSettings(next);
			printRecord(ctx.out, ctx.format, saved, settingsRecord);
		},
	});

export const on = toggle(true);
export const off = toggle(false);
