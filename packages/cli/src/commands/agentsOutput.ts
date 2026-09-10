import type { AgentSession, AgentSettings } from "@trellis/api";
import { cell, type ListSpec, type RecordSpec } from "../output.ts";

// The title comes first: it is the tab name a person sees in Superset.
// `reason` is set for a session in the `failed` state, so a list states why
// a start never ran.
export const sessionList: ListSpec<AgentSession> = {
	columns: [
		{ name: "title", value: (row) => row.title },
		{ name: "role", value: (row) => row.role },
		{ name: "state", value: (row) => row.state },
		{ name: "reason", value: (row) => cell(row.failure?.reason) },
		{ name: "workspace", value: (row) => cell(row.workspaceId) },
		{ name: "lastWoken", value: (row) => cell(row.lastWokenAt) },
		{ name: "id", value: (row) => row.id },
	],
	identifier: (row) => row.id,
};

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
		{ name: "reason", value: (row) => cell(row.failure?.reason) },
		{ name: "exit", value: (row) => cell(row.failure?.exitCode) },
		{ name: "detail", value: (row) => cell(row.failure?.detail) },
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
