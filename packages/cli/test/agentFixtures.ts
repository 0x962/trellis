import { projectId, projectId2, ticketId } from "./fixtures.ts";

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
	title: "CDE-42",
	openUrl: "superset://workspace/ws-1",
	blocked: null,
	lastWokenAt: null,
	createdAt: "2026-09-10T10:00:00.000Z",
	...overrides,
});

export const managerSession = (overrides: Overrides = {}) =>
	agentSession({ id: sessionId2, ticketId: null, role: "manager", title: "CDE manager", ...overrides });

export const projectSettings = (overrides: Overrides = {}) => ({
	projectId,
	enabled: true,
	supersetProjectId: null,
	baseBranch: "main",
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
