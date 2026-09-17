import type { CommandDef } from "citty";

type Loader = () => Promise<CommandDef>;

// citty types a command by its own args, so a table that holds every
// command holds the untyped form.
const command = (loaded: unknown) => loaded as CommandDef;

// One row per verb of the CLI table. `load` imports the verb's module on
// dispatch, so `--help` and a stub load no command module. Every specifier
// is a literal, so a bundle of this file carries every verb.
export const verbs: Record<string, { description: string; load: Loader }> = {
	models: {
		description: "List canonical model IDs",
		load: () => import("./commands/models/models.ts").then((m) => command(m.default)),
	},
	accounts: {
		description: "List harness accounts and check quota",
		load: () => import("./commands/accounts.ts").then((m) => command(m.default)),
	},
	manager: {
		description: "Read manager work and record coordination outcomes",
		load: () => import("./commands/manager.ts").then((m) => command(m.default)),
	},
	doctor: {
		description: "Inspect the local host and execution service",
		load: () => import("./commands/doctor.ts").then((m) => command(m.default)),
	},
	gateway: {
		description: "Serve local hostnames and legacy reviews",
		load: () => import("./commands/gateway").then((m) => command(m.default)),
	},
	review: {
		description: "Review PR diffs and local findings",
		load: () => import("./commands/review/review").then((m) => command(m.default)),
	},
	projects: {
		description: "List, create, show, move, or set repos on projects",
		load: () => import("./commands/projects.ts").then((m) => command(m.default)),
	},
	statuses: {
		description: "List, add, edit, remove, or clear statuses",
		load: () => import("./commands/statuses.ts").then((m) => command(m.default)),
	},
	agents: {
		description: "List, start, refresh, stop, or talk to agents",
		load: () => import("./commands/agents.ts").then((m) => command(m.default)),
	},
	create: {
		description: "Create a ticket",
		load: () => import("./commands/create.ts").then((m) => command(m.default)),
	},
	show: { description: "Show one ticket", load: () => import("./commands/show.ts").then((m) => command(m.default)) },
	list: {
		description: "List tickets by the shared filter grammar",
		load: () => import("./commands/list.ts").then((m) => command(m.default)),
	},
	edit: {
		description: "Change ticket fields",
		load: () => import("./commands/edit.ts").then((m) => command(m.default)),
	},
	move: {
		description: "Move a ticket to a status",
		load: () => import("./commands/move.ts").then((m) => command(m.default)),
	},
	comment: {
		description: "Add a comment",
		load: () => import("./commands/comment.ts").then((m) => command(m.default)),
	},
	comments: {
		description: "List the comments of a ticket",
		load: () => import("./commands/comment.ts").then((m) => command(m.comments)),
	},
	thread: {
		description: "Show, resolve, or reopen a comment thread",
		load: () => import("./commands/thread.ts").then((m) => command(m.default)),
	},
	notes: {
		description: "Read and write the notes of a project",
		load: () => import("./commands/notes.ts").then((m) => command(m.default)),
	},
	attach: {
		description: "Upload a file to a ticket",
		load: () => import("./commands/attach.ts").then((m) => command(m.default)),
	},
	attachments: {
		description: "List the attachments of a ticket",
		load: () => import("./commands/attach.ts").then((m) => command(m.attachments)),
	},
	pr: {
		description: "Link, list, remove, refresh, or diff pull requests",
		load: () => import("./commands/pr.ts").then((m) => command(m.default)),
	},
	sub: { description: "Create a sub-ticket", load: () => import("./commands/sub.ts").then((m) => command(m.default)) },
	delete: {
		description: "Delete a ticket",
		load: () => import("./commands/delete.ts").then((m) => command(m.default)),
	},
	search: {
		description: "Search tickets and projects",
		load: () => import("./commands/search.ts").then((m) => command(m.default)),
	},
	activity: {
		description: "List the activity of a ticket",
		load: () => import("./commands/activity.ts").then((m) => command(m.default)),
	},
	brief: {
		description: "Print the markdown brief of a ticket",
		load: () => import("./commands/brief.ts").then((m) => command(m.default)),
	},
	watch: {
		description: "Print events as JSON lines",
		load: () => import("./commands/watch.ts").then((m) => command(m.default)),
	},
	open: {
		description: "Print or open the web URL of a ticket",
		load: () => import("./commands/open.ts").then((m) => command(m.default)),
	},
	whoami: {
		description: "Explain the actor resolution",
		load: () => import("./commands/whoami.ts").then((m) => command(m.default)),
	},
	instructions: {
		description: "Print the AGENTS.md block",
		load: () => import("./commands/instructions.ts").then((m) => command(m.default)),
	},
	status: {
		description: "Show server health",
		load: () => import("./commands/status.ts").then((m) => command(m.default)),
	},
	logs: {
		description: "Tail the server log",
		load: () => import("./commands/logs.ts").then((m) => command(m.default)),
	},
	serve: {
		description: "Run the server in the foreground",
		load: () => import("./commands/serve.ts").then((m) => command(m.default)),
	},
	install: {
		description: "Install the server as a launchd agent",
		load: () => import("./commands/install.ts").then((m) => command(m.default)),
	},
	uninstall: {
		description: "Remove the launchd agent",
		load: () => import("./commands/uninstall.ts").then((m) => command(m.default)),
	},
	backup: {
		description: "Write a backup archive",
		load: () => import("./commands/backup.ts").then((m) => command(m.default)),
	},
	restore: {
		description: "Restore a backup archive",
		load: () => import("./commands/restore.ts").then((m) => command(m.default)),
	},
	export: {
		description: "Stream every table as NDJSON",
		load: () => import("./commands/export.ts").then((m) => command(m.default)),
	},
};
