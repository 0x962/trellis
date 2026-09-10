import type { Inbox } from "@trellis/api";
import { agent, human, setGhReply } from "./server";
import { reset, type Seeder, seedPr, seedProject, seedTicket, setStalledHours } from "./seed";

// The Needs you sections, seeded through the real API. Every file that reads
// the inbox seeds it here, because the inbox spans every project the server
// holds.

export const seeder: Seeder = { human, agent, setGhReply };

// The stalled threshold the suite runs with: a started ticket counts as
// stalled 5.4 seconds after its last change. A move inside a test never
// lands in Stalled, because a screen refetches the inbox at most 4 seconds
// after a write.
export const stalledHours = 0.0015;

// The stalled row lives in its own project, which outlives the reset of each
// test, so one file waits for the threshold once.
const stalledKey = "PLT";
const stalledTitle = "Reopen a closed shell in the same directory";

export const projectKey = "CDE";
export const projectName = "Code";

const reviewTitles = [
	"Add a cancel action to a long running query",
	"Persist the open tabs across an app restart",
	"Batch the pull request poll into one query",
];
const failingCiTitle = "Keep the terminal scrollback on a session handoff";
const doneTitles = [
	"Keep the starred runs after a reload",
	"Focus the terminal of a new tab",
	"Rename a tab on a double click",
];

export const failingCheck = "typecheck (desktop)";

export type InboxSeed = {
	// The rows in Review, in the order the section lists them.
	review?: number;
	// One open ticket whose pull request fails its CI.
	failingCi?: boolean;
	// The one started ticket that sat still past the threshold.
	stalled?: boolean;
	// The tickets an agent completed today.
	done?: number;
	// Started tickets that agents hold, which the empty state counts.
	inProgress?: number;
};

export type InboxData = {
	project: string;
	review: string[];
	failingCi: string | undefined;
	stalled: string | undefined;
	done: string[];
};

let stalledId: string | undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until the server counts the seeded row as stalled. The threshold is
// wall clock time, so the poll ends as soon as it passes.
const waitForStalled = async () => {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		if ((await human.inbox.get({})).stalled.total > 0) return;
		await sleep(50);
	}
	throw new Error("the seeded ticket never became stalled");
};

const seedStalled = async () => {
	if (stalledId !== undefined) return stalledId;
	await seedProject(seeder, { key: stalledKey, name: "Platform" });
	const ticket = await seedTicket(seeder, {
		project: stalledKey,
		title: stalledTitle,
		status: "in-progress",
		by: "agent",
	});
	stalledId = ticket.identifier;
	await waitForStalled();
	return stalledId;
};

// Drops every project of the file before, seeds one project, and fills the
// four sections. The returned identifiers are the rows each section holds.
export const seedInbox = async (seed: InboxSeed = {}): Promise<InboxData> => {
	const wantsStalled = seed.stalled ?? true;
	if (!wantsStalled) stalledId = undefined;
	await reset(seeder, wantsStalled ? [stalledKey] : []);
	await setStalledHours(seeder, stalledHours);
	const stalled = wantsStalled ? await seedStalled() : undefined;
	await seedProject(seeder, { key: projectKey, name: projectName, children: ["web"] });
	const web = `${projectKey}.web`;

	const review: string[] = [];
	for (let index = 0; index < (seed.review ?? 3); index += 1) {
		const ticket = await seedTicket(seeder, {
			project: web,
			title: reviewTitles[index % reviewTitles.length]!,
			priority: "high",
			status: "human-review",
			by: "agent",
		});
		review.push(ticket.identifier);
	}

	let failingCi: string | undefined;
	if (seed.failingCi ?? true) {
		const ticket = await seedTicket(seeder, { project: web, title: failingCiTitle, priority: "urgent" });
		await seedPr(seeder, ticket.identifier, {
			number: 121,
			title: "Keep the scrollback across a handoff",
			headRef: "cde-scrollback-handoff",
			checks: [
				{ name: "lint", conclusion: "SUCCESS" },
				{ name: failingCheck, conclusion: "FAILURE" },
				{ name: "test (host-service)", conclusion: "SUCCESS" },
			],
		});
		failingCi = ticket.identifier;
	}

	const done: string[] = [];
	for (let index = 0; index < (seed.done ?? 3); index += 1) {
		const ticket = await seedTicket(seeder, {
			project: web,
			title: doneTitles[index % doneTitles.length]!,
			status: "done",
			by: "agent",
		});
		done.push(ticket.identifier);
	}
	for (let index = 0; index < (seed.inProgress ?? 0); index += 1) {
		await seedTicket(seeder, {
			project: web,
			title: `Agent work ${index + 1}`,
			status: "in-progress",
			by: "agent",
		});
	}
	// The section lists the newest completion first.
	return { project: projectKey, review, failingCi, stalled, done: [...done].reverse() };
};

export const totals = (inbox: Inbox) => [
	inbox.review.total,
	inbox.failingCi.total,
	inbox.stalled.total,
	inbox.doneByAgentsToday.total,
];

// Adds `count` review rows in one batch, so the Review section runs past its
// 100-row cap.
export const padReview = async (project: string, count: number) => {
	const created: string[] = [];
	for (let index = 0; index < count; index += 1) {
		const ticket = await human.tickets.create({ project, title: `Review ${index}` });
		created.push(ticket.identifier);
	}
	await human.tickets.updateMany({ tickets: created, status: "human-review" });
};

// Bumps the stored version of one ticket without an event, so the next move
// that carries the old version is VERSION_CONFLICT.
export const bumpVersion = (identifier: string) =>
	human.tickets.update({ ticket: identifier, title: `${identifier} retitled elsewhere` });
