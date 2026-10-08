import type { Epic, EpicSummary, WaveSummary } from "@trellis/api";
import { actor, id, project, tickets, timestamp } from "./project";

export const emptyCounts = { total: 0, todo: 0, started: 0, review: 0, done: 0, canceled: 0 };
export const waves: WaveSummary[] = [
	{
		id: id(210),
		epicId: id(200),
		ref: "DEMO/interface-review/wave-1",
		slug: "wave-1",
		name: "Wave 1",
		position: 0,
		counts: { total: 5, todo: 2, started: 1, review: 1, done: 1, canceled: 0 },
		state: "open",
		toStart: 1,
		waitsForYou: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: id(211),
		epicId: id(200),
		ref: "DEMO/interface-review/wave-2",
		slug: "wave-2",
		name: "Wave 2",
		position: 1,
		counts: emptyCounts,
		state: "open",
		toStart: 0,
		waitsForYou: 0,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

export const epic: Epic = {
	id: id(200),
	projectId: project.id,
	projectKey: project.key,
	ref: "DEMO/interface-review",
	slug: "interface-review",
	name: "Interface review",
	description:
		"## Plan\n\nReview each shared view at desktop and phone widths.\n\nUse the same components for the board, table, ticket, and review pages.",
	counts: waves[0]!.counts,
	state: "open",
	currentWave: waves[0]!,
	currentWaveIndex: 1,
	waveCount: 2,
	resourceCount: 0,
	actor,
	createdAt: timestamp,
	updatedAt: timestamp,
	waves,
	tickets,
};

export const epics: EpicSummary[] = [
	epic,
	{
		...epic,
		id: id(201),
		ref: "DEMO/completed-review",
		slug: "completed-review",
		name: "A completed review with a long name that reaches the reserved progress and action columns",
		state: "done",
		counts: { ...emptyCounts, total: 8, done: 8 },
		currentWave: null,
		currentWaveIndex: null,
	},
];
