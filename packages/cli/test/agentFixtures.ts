import { activity, projectId, projectId2, ticketId } from "./fixtures.ts";

type Overrides = Record<string, unknown>;

export const sessionId = "01J8Z6X4Q3M2K1H0G9F8E7D6G1";
export const sessionId2 = "01J8Z6X4Q3M2K1H0G9F8E7D6G2";

// A builder session for CDE-42 that the runner started.
export const agentSession = (overrides: Overrides = {}) => ({
	id: sessionId,
	projectId,
	ticketId,
	role: "builder",
	runner: "superset",
	state: "running",
	workspaceId: "ws-1",
	terminalId: "term-1",
	name: "Kenji",
	title: "CDE-42",
	openUrl: "superset://workspace/ws-1",
	lastWokenAt: null,
	error: null,
	createdAt: "2026-09-10T10:00:00.000Z",
	...overrides,
});

export const managerSession = (overrides: Overrides = {}) =>
	agentSession({ id: sessionId2, ticketId: null, role: "manager", name: "Amara", title: "CDE manager", ...overrides });

// A manager whose start failed, a running builder, one manager action, and
// one batch.
export const agentsOverview = () => ({
	sessions: [
		managerSession({
			state: "failed",
			workspaceId: null,
			terminalId: null,
			openUrl: null,
			error: "The agent runner cannot serve the request. superset ws create: fatal: invalid reference: main",
		}),
		agentSession(),
	],
	actions: [activity({ actor: { kind: "agent", name: "manager-cde" } })],
	tickets: [{ id: ticketId, identifier: "CDE-42" }],
	batches: [
		{
			at: "2026-09-10T10:00:00.000Z",
			projectId,
			count: 2,
			text: "trellis: 2 changes in CDE (CDE-42 created by navid, CDE-42 commented by navid). Run: trellis agents inbox --project CDE",
		},
	],
});

export const projectSettings = (overrides: Overrides = {}) => ({
	projectId,
	enabled: true,
	supersetProjectId: null,
	baseBranch: null,
	maxConcurrent: 3,
	removeWorkspaceOnDone: true,
	...overrides,
});

// The global switch is on and two projects have a row.
export const agentSettings = (overrides: Overrides = {}) => ({
	runner: "superset",
	enabled: true,
	projects: [projectSettings(), projectSettings({ projectId: projectId2, enabled: false })],
	...overrides,
});
