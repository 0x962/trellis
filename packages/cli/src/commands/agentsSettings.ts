import type { AgentProjectSettings, AgentSession, AgentSettings } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { json, printList, printRecord } from "../output.ts";
import { sessionList, settingsRecord } from "./agentsOutput.ts";

// `agents.sessions` takes one scope. Without a flag, the verb reads the
// sessions of every project that has an agent settings row.
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
		const sessions: AgentSession[] = [];
		if (project !== undefined || ticket !== undefined) {
			sessions.push(...(await client.agents.sessions(compact({ project, ticket }))).sessions);
		} else {
			for (const row of (await client.agents.settings()).projects) {
				sessions.push(...(await client.agents.sessions({ project: row.projectId })).sessions);
			}
		}
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
