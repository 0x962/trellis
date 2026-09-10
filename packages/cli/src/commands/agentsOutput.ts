import type { Activity, AgentBatchRecord, AgentSession, AgentSettings } from "@trellis/api";
import { type Column, cell, type ListSpec, type RecordSpec } from "../output.ts";

// The title comes first: it is the tab name a person sees in Superset. A
// failed session carries what the runner said in `error`.
export const sessionColumns: Column<AgentSession>[] = [
	{ name: "title", value: (row) => row.title },
	{ name: "role", value: (row) => row.role },
	{ name: "state", value: (row) => row.state },
	{ name: "workspace", value: (row) => cell(row.workspaceId) },
	{ name: "lastWoken", value: (row) => cell(row.lastWokenAt) },
	{ name: "error", value: (row) => cell(row.error) },
	{ name: "id", value: (row) => row.id },
];

export const sessionList: ListSpec<AgentSession> = {
	columns: sessionColumns,
	identifier: (row) => row.id,
};

// One write of an agent. `identifiers` names the ticket of each row.
export const actionColumns = (identifiers: Map<string, string>): Column<Activity>[] => [
	{ name: "ticket", value: (row) => cell(row.ticketId === null ? null : identifiers.get(row.ticketId)) },
	{ name: "actor", value: (row) => `${row.actor.kind}:${row.actor.name}` },
	{ name: "action", value: (row) => row.action },
	{
		name: "change",
		value: (row) => (row.field === null ? "-" : cell(`${row.field}: ${row.fromValue ?? "-"} -> ${row.toValue ?? "-"}`)),
	},
];

// One batch the dispatcher typed into a manager.
export const batchColumns: Column<AgentBatchRecord>[] = [
	{ name: "at", value: (row) => row.at },
	{ name: "project", value: (row) => row.projectId },
	{ name: "count", value: (row) => String(row.count) },
	{ name: "text", value: (row) => cell(row.text) },
];

export const sessionRecord: RecordSpec<AgentSession> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "title", value: (row) => row.title },
		{ name: "role", value: (row) => row.role },
		{ name: "state", value: (row) => row.state },
		{ name: "runner", value: (row) => row.runner },
		{ name: "workspace", value: (row) => cell(row.workspaceId) },
		{ name: "terminal", value: (row) => cell(row.terminalId) },
		{ name: "open", value: (row) => cell(row.openUrl) },
		{ name: "lastWoken", value: (row) => cell(row.lastWokenAt) },
		{ name: "created", value: (row) => row.createdAt },
	],
	identifier: (row) => row.id,
};

const onOff = (enabled: boolean) => (enabled ? "on" : "off");

// `enabled` is the global switch. `projects` counts the projects whose
// manager is on.
export const settingsRecord: RecordSpec<AgentSettings> = {
	fields: [
		{ name: "runner", value: (row) => row.runner },
		{ name: "enabled", value: (row) => onOff(row.enabled) },
		{
			name: "projects",
			value: (row) => `${row.projects.filter((project) => project.enabled).length} of ${row.projects.length} on`,
		},
	],
	identifier: (row) => onOff(row.enabled),
};
