import type { Project, ProjectSummary, Repo } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, splitList } from "../context.ts";
import { cell, type ListSpec, printList, printRecord, type RecordSpec } from "../output.ts";

const projectList: ListSpec<ProjectSummary> = {
	columns: [
		{ name: "key", value: (row) => row.key },
		{ name: "slug", value: (row) => row.slug },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "open", value: (row) => String(row.openCount) },
		{ name: "archived", value: (row) => cell(row.archivedAt) },
	],
	identifier: (row) => row.key,
};

const repoName = (repo: Pick<Repo, "owner" | "repo">) => `${repo.owner}/${repo.repo}`;

const projectRecord: RecordSpec<Project> = {
	fields: [
		{ name: "key", value: (row) => row.key },
		{ name: "slug", value: (row) => row.slug },
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "description", value: (row) => cell(row.description) },
		{ name: "repos", value: (row) => cell(row.repos.map(repoName).join(", ")) },
		{ name: "statuses", value: (row) => cell(row.statuses.map((status) => status.slug).join(", ")) },
		{ name: "open", value: (row) => String(row.openCount) },
		{ name: "ticketCounter", value: (row) => String(row.ticketCounter) },
		{ name: "archived", value: (row) => cell(row.archivedAt) },
	],
	identifier: (row) => row.key,
};

const repoList: ListSpec<Repo> = {
	columns: [
		{ name: "repo", value: repoName },
		{ name: "id", value: (row) => row.id },
	],
	identifier: repoName,
};

const list = defineCommand({
	meta: { name: "list", description: "List every project" },
	args: { archived: { type: "boolean", description: "Include archived projects" } },
	async run(context) {
		const ctx = contextOf(context);
		const rows = await clientOf(ctx).projects.list(
			compact({ archived: context.args.archived === true ? true : undefined }),
		);
		printList(ctx.out, ctx.format, rows, projectList);
	},
});

const create = defineCommand({
	meta: { name: "create", description: "Create a project" },
	args: {
		key: { type: "string", required: true, description: "Key of the project, KEY" },
		name: { type: "string", required: true, description: "Name" },
		description: { type: "string", description: "Description" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const project = await clientOf(ctx).projects.create(
			compact({ key: args.key, name: args.name, description: args.description }),
		);
		printRecord(ctx.out, ctx.format, project, projectRecord);
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Show one project" },
	args: { project: { type: "positional", required: true, description: "Project ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const project = await clientOf(ctx).projects.get({ project: context.args.project });
		printRecord(ctx.out, ctx.format, project, projectRecord);
	},
});

const move = defineCommand({
	meta: { name: "move", description: "Reorder a project" },
	args: {
		project: { type: "positional", required: true, description: "Project ref" },
		after: { type: "string", description: "Place after this project" },
		before: { type: "string", description: "Place before this project" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const project = await clientOf(ctx).projects.move(
			compact({ project: args.project, after: args.after, before: args.before }),
		);
		printRecord(ctx.out, ctx.format, project, projectRecord);
	},
});

// The server takes the whole set, so the verb reads it, applies the adds
// and removes, and writes it back. An add of a repo in the set changes nothing.
const repos = defineCommand({
	meta: { name: "repos", description: "Add or remove the repos the poller scans" },
	args: {
		project: { type: "positional", required: true, description: "Project ref" },
		add: { type: "string", description: "owner/repo to add, comma-separated" },
		remove: { type: "string", description: "owner/repo to remove, comma-separated" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const current = await client.projects.get({ project: args.project });
		const set = new Set(current.repos.map(repoName));
		for (const name of splitList(args.remove) ?? []) set.delete(name);
		for (const name of splitList(args.add) ?? []) set.add(name);
		const rows = await client.projects.setRepos({
			project: args.project,
			repos: [...set].map((name) => {
				const [owner, repo] = name.split("/");
				return { owner: owner!, repo: repo! };
			}),
		});
		printList(ctx.out, ctx.format, rows, repoList);
	},
});

export default defineCommand({
	meta: { name: "projects", description: "List, create, show, reorder, or set repos on projects" },
	subCommands: { list, create, show, move, repos },
});
