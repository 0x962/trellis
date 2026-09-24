import { type CommandDef, defineCommand } from "citty";
import { alias } from "./alias.ts";

type Entry = { description: string; load: () => Promise<CommandDef> };
type Children = Record<string, () => Promise<CommandDef>>;

const group = (name: string, description: string, children: Children): Entry => ({
	description,
	load: async () => defineCommand({ meta: { name, description }, subCommands: children }),
});

const extend = (source: string, name: string, children: Children): Entry => ({
	description: `Manage ${name} records`,
	load: async () => {
		const command = await alias(source)();
		const existing = await (typeof command.subCommands === "function" ? command.subCommands() : command.subCommands);
		return {
			...command,
			meta: { name, description: `Manage ${name} records` },
			subCommands: { ...existing, ...children },
		};
	},
});

export const commandTree: Record<string, Entry> = {
	project: extend("projects", "project", {
		status: alias("statuses"),
		label: alias("labels"),
		note: alias("notes"),
	}),
	ticket: group("ticket", "Create, inspect, and update tickets", {
		list: alias("list"),
		show: alias("show"),
		create: alias("create"),
		edit: alias("edit"),
		"set-status": alias("move"),
		delete: alias("delete"),
		brief: alias("brief"),
		open: alias("open"),
		contract: alias("contract"),
		outcome: alias("outcome"),
		dependency: group("dependency", "Inspect ticket dependencies", { list: alias("deps") }).load,
		attachment: group("attachment", "Read and add ticket attachments", {
			list: alias("attachments"),
			add: alias("attach"),
		}).load,
	}),
	epic: extend("epics", "epic", {
		status: group("status", "Inspect epic progress", {
			show: () => import("../commands/epics/status.ts").then((m) => m.default as CommandDef),
		}).load,
	}),
	wave: extend("waves", "wave", {}),
	diff: {
		description: "Link diffs, manage local review, and record evidence",
		load: () => import("../commands/diff/diff.ts").then((m) => m.default),
	},
	flow: {
		description: "Start flows and inspect their saved runs",
		load: () => import("../commands/flow/flow.ts").then((m) => m.default),
	},
	agent: extend("agents", "agent", {}),
	session: extend("sessions", "session", {}),
	resource: { description: "Manage epic resources and document comments", load: alias("resource") },
	model: extend("models", "model", {}),
	account: extend("accounts", "account", {
		quota: group("quota", "Inspect account quota", { show: alias("accounts", ["quota"]) }).load,
	}),
	identity: group("identity", "Inspect the current identity", { show: alias("whoami") }),
	guide: group("guide", "Read the Trellis agent guide", { show: alias("instructions") }),
	activity: group("activity", "Inspect ticket activity", { list: alias("activity") }),
	event: group("event", "Observe Trellis events", { watch: alias("watch") }),
	host: group("host", "Inspect and manage the Trellis host", {
		status: group("status", "Read host status", { show: alias("status") }).load,
		doctor: alias("doctor"),
		log: group("log", "Read host logs", { list: alias("logs") }).load,
		serve: alias("serve"),
		install: alias("install"),
		uninstall: alias("uninstall"),
		gateway: group("gateway", "Manage the hostname gateway", { start: alias("gateway") }).load,
	}),
	data: group("data", "Search and transfer Trellis data", {
		search: alias("search"),
		backup: alias("backup"),
		restore: alias("restore"),
		export: alias("export"),
	}),
};
