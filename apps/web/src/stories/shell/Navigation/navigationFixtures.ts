import type { MachinePressureMachineView } from "@trellis/ui";
import { id, project, timestamp } from "../../pages/fixtures/project";
import { run, session } from "../../pages/fixtures/session";

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

const sessionActivity = {
	sessionId: reviewSessions[1]!.id,
	run: {
		...run,
		id: id(601),
		name: reviewSessions[1]!.name,
		projectId: null,
		projectKey: "",
		state: "running" as const,
		processStatus: "running" as const,
		terminalId: "storybook-attempt",
		observation: runningObservation("storybook-turn"),
	},
};

const projectActivity = {
	sessionId: null,
	run: {
		...run,
		id: id(602),
		name: "Review Atlas flow labels",
		projectId: atlas.id,
		projectKey: atlas.key,
		state: "running" as const,
		processStatus: "running" as const,
		terminalId: "storybook-project-attempt",
		observation: runningObservation("storybook-project-turn"),
	},
};

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
	activities: [sessionActivity, projectActivity],
	pressureMachine,
};
