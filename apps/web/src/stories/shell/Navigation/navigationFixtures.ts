import type { AgentActivity, AgentRun, SessionDetail } from "@trellis/api";
import type { MachinePressureMachineView } from "@trellis/ui";
import { id, project, timestamp } from "../../pages/fixtures/project";
import { run, session } from "../../pages/fixtures/session";
import { terminalSession } from "../../pages/fixtures/sessionStates";

const atlas = {
	...project,
	key: "ATL",
	slug: "atlas",
	name: "Atlas",
	openEpicCount: 3,
	color: "pine" as const,
};

const reviewProjects = [
	atlas,
	{ ...project, id: id(2), key: "FOR", slug: "forge", name: "Forge", position: 1, color: "rust" as const },
	{
		...project,
		id: id(3),
		key: "CLI",
		slug: "client-libraries",
		name: "Client libraries with duplicate release names",
		position: 2,
		color: "cobalt" as const,
	},
];

const reviewSessions = [
	{ ...session, id: id(501), name: "Release review", projectId: null, projectKey: null, pinnedAt: timestamp },
	{
		...session,
		id: id(502),
		name: "Investigate slow workspace startup after restart",
		projectId: null,
		projectKey: null,
		pinnedAt: null,
	},
	{ ...session, id: id(503), name: "API compatibility checks", projectId: null, projectKey: null, pinnedAt: null },
	{ ...session, id: id(504), name: "Release review", projectId: null, projectKey: null, pinnedAt: null },
	{ ...session, id: id(505), name: "Inspect the phone navigation", projectId: null, projectKey: null, pinnedAt: null },
	{ ...session, id: id(506), name: "Verify page tabs and Back", projectId: null, projectKey: null, pinnedAt: null },
	{ ...session, id: id(507), name: "Review connection warnings", projectId: null, projectKey: null, pinnedAt: null },
	{ ...session, id: id(508), name: "Check project menus", projectId: null, projectKey: null, pinnedAt: null },
];

const runningObservation = (turnId: string) => ({
	checkedAt: timestamp,
	controllable: true,
	activity: { state: "working" as const, updatedAt: timestamp },
	lastMessage: null,
	lastTool: null,
	outcome: null,
	turnId,
});

const projectSession = (index: number, name: string, state: "running" | "needs-input"): SessionDetail => {
	const detail = terminalSession(state);
	const sessionId = id(520 + index);
	const runId = id(620 + index);
	return {
		...detail,
		id: sessionId,
		name,
		projectId: atlas.id,
		projectKey: atlas.key,
		runId,
		run: {
			...detail.run,
			id: runId,
			name,
			projectId: atlas.id,
			projectKey: atlas.key,
			sessionId,
			observation: state === "running" ? runningObservation(`storybook-project-turn-${index}`) : detail.run.observation,
		},
	};
};

const projectSessions = [
	projectSession(0, "Review Atlas flow labels", "running"),
	projectSession(1, "Choose the Atlas release view", "needs-input"),
];

const projectActivities: AgentActivity[] = projectSessions.map((detail) => ({
	sessionId: detail.id,
	run: detail.run,
}));

const sessionActivity = (index: number, activityRun: AgentRun): AgentActivity => ({
	sessionId: reviewSessions[index]!.id,
	run: {
		...activityRun,
		id: id(610 + index),
		name: reviewSessions[index]!.name,
		projectId: null,
		projectKey: "",
		sessionId: reviewSessions[index]!.id,
	},
});

const statusActivities: AgentActivity[] = [
	sessionActivity(0, { ...run, state: "starting", processStatus: null }),
	sessionActivity(1, terminalSession("running").run),
	sessionActivity(2, terminalSession("needs-input").run),
	sessionActivity(3, {
		...run,
		kind: "agent",
		ticketId: id(710),
		ticketIdentifier: "ATL-10",
		ticketTitle: "Keep the saved session available",
		ticketStatusCategory: "started",
		assigned: true,
		state: "stopped",
		processStatus: "exited",
	}),
	sessionActivity(4, {
		...run,
		kind: "agent",
		ticketId: id(711),
		ticketIdentifier: "ATL-11",
		ticketTitle: "Verify page tabs and Back",
		ticketStatusCategory: "done",
		assigned: true,
		state: "stopped",
		processStatus: "exited",
	}),
	sessionActivity(5, { ...run, state: "failed", error: "The synthetic start failed." }),
	sessionActivity(6, terminalSession("unavailable").run),
];

const pressureMachine: MachinePressureMachineView = {
	id: "storybook-host",
	name: "Synthetic host",
	readings: [
		{
			key: "cpuLoad",
			label: "CPU load",
			value: "2.4",
			unit: "per core",
			tone: "warning",
			freshness: "live",
		},
		{
			key: "memory",
			label: "Memory pressure",
			value: "Critical",
			tone: "danger",
			freshness: "live",
		},
	],
};

export const navigationFixtures = {
	atlas,
	reviewProjects,
	reviewSessions,
	projectSessions,
	activities: [...statusActivities, ...projectActivities],
	pressureMachine,
};
