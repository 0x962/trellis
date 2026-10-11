import type { AgentRunListRequest } from "@trellis/api";
import { epic, epics } from "../../pages/fixtures/epic";
import { timestamp } from "../../pages/fixtures/project";
import { reviewResponses } from "../../pages/fixtures/review";
import { sessionResponses } from "../../pages/fixtures/session";
import { settings, settingsResponses } from "../../pages/fixtures/settings";
import { navigationFixtures } from "./navigationFixtures";

const { activities, atlas, projectSessions, reviewProjects, reviewSessions } = navigationFixtures;

const atlasEpic = {
	...epic,
	projectId: atlas.id,
	projectKey: atlas.key,
	ref: `${atlas.key}/${epic.slug}`,
	waves: epic.waves.map((wave) => ({ ...wave, ref: `${atlas.key}/${epic.slug}/${wave.slug}` })),
};

const atlasEpics = epics.map((item, index) => ({
	...item,
	projectId: atlas.id,
	projectKey: atlas.key,
	ref: `${atlas.key}/${item.slug}`,
	...(index === 0 ? atlasEpic : {}),
}));

const projectRuns = projectSessions.map((item) => item.run);
const sessions = [...reviewSessions, ...projectSessions];

const agentRuns = (input: AgentRunListRequest) => {
	const items = input.ids
		? projectRuns.filter((run) => input.ids?.includes(run.id))
		: input.project === atlas.id
			? projectRuns
			: [];
	return { items, nextCursor: null };
};

export const actualSourceResponses = {
	...sessionResponses,
	...reviewResponses,
	...settingsResponses,
	"actors.default": { name: "Storybook", kind: "human" as const, stored: true },
	"projects.get": atlas,
	"projects.list": (input: { archived?: boolean }) => (input.archived ? [] : reviewProjects),
	"projects.repos": atlas.repos,
	"epics.get": atlasEpic,
	"epics.list": atlasEpics,
	"sessions.list": sessions,
	"agentRuns.list": agentRuns,
	"agentRuns.activity": activities,
	"settings.get": settings,
	"system.gh": { ok: true, user: "storybook", reason: null, message: null, checkedAt: timestamp },
	"system.pressure": {
		sampledAt: timestamp,
		hostname: "storybook-host",
		platform: "darwin",
		cpuCount: 8,
		loadAverage1m: 2,
		loadPerCore: 0.25,
		memoryLevel: 1,
		processorTemperature: { state: "unavailable" as const, reason: "reader-not-installed" as const, readDurationMs: 0 },
		disk: { state: "failed" as const, path: "/workspace/storybook" },
		runs: [],
	},
	// ReviewPage refreshes its source on entry. This response keeps the generated-router fixture inside synthetic data.
	"reviews.refresh": reviewResponses["reviews.refresh"],
};
