import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { TrellisEvent } from "@trellis/api";
import { createGhRunner } from "../../src/gh/run.ts";
import { linkPr, type PrSeed, type Row, seedPr, seedTicket } from "../fixtures";
import { type FakeTimerClock, fakeTimerClock } from "./clock.ts";
import type { TestDb } from "./db.ts";
import { type GhStubHandle, ghStub, type StubReply, type StubSpawn } from "./gh-stub.ts";

// The hook a boot hands the poller: the database, the gh runner, the event
// sink, the log line writer, and the clock. A test builds the same hook with
// a clock it moves by hand and a gh stub that records every spawn.

export type PollerHook = {
	db: TestDb["db"];
	gh: ReturnType<typeof createGhRunner>;
	sink: (events: TrellisEvent[]) => void;
	log: (...line: unknown[]) => void;
	now: () => Date;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
};

// The instant every poller test starts at. Every cadence in a test is a
// number of seconds from this reading.
export const BASE = new Date("2026-09-09T12:00:00.000Z");

export const secondsFrom = (seconds: number, from: Date = BASE) => new Date(from.getTime() + seconds * 1000);

export const hoursBefore = (hours: number, from: Date = BASE) => new Date(from.getTime() - hours * 3_600_000);

const SIGNED_IN = "github.com\n  Logged in to github.com account navid (keyring)\n";

export const authReply: StubReply = { stdout: SIGNED_IN, stderr: "", exitCode: 0 };

export const signedOutReply: StubReply = {
	stdout: "",
	stderr: "To get started with GitHub CLI, please run: gh auth login",
	exitCode: 1,
};

// `gh api rate_limit` reports one budget per resource. `remaining` is the
// graphql budget the poller divides by the limit.
export const rateLimitReply = (remaining: number, limit = 5000): StubReply => ({
	stdout: JSON.stringify({
		resources: {
			core: { limit: 5000, remaining: 5000, reset: Math.floor(BASE.getTime() / 1000) + 3600 },
			graphql: { limit, remaining, reset: Math.floor(BASE.getTime() / 1000) + 3600 },
		},
	}),
	stderr: "",
	exitCode: 0,
});

export type ListedPr = { number: number; url: string; title: string; headRefName: string; body: string };

export const prListReply = (entries: Array<Partial<ListedPr> & { number: number }>): StubReply => ({
	stdout: JSON.stringify(
		entries.map((entry) => ({
			number: entry.number,
			url: entry.url ?? `https://github.com/acme/web/pull/${entry.number}`,
			title: entry.title ?? `PR ${entry.number}`,
			headRefName: entry.headRefName ?? "feature",
			body: entry.body ?? "",
		})),
	),
	stderr: "",
	exitCode: 0,
});

// A body that answers every alias with an error entry. gh maps each alias to
// a fetch error, so a batch test counts spawns without matching the reply to
// the pull requests the poller chose.
export const errorsReply = (aliases: number, message = "Could not resolve to a Repository"): StubReply => ({
	stdout: JSON.stringify({
		data: Object.fromEntries(Array.from({ length: aliases }, (_, index) => [`pr${index}`, null])),
		errors: Array.from({ length: aliases }, (_, index) => ({ message, path: [`pr${index}`] })),
	}),
	stderr: "",
	exitCode: 0,
});

// The stored fields of a pull request that `seedPr` writes and a reply with
// the same number and url carries. A row seeded with the hash of this object
// is a row the poller finds unchanged.
export const seededContent = (input: { owner?: string; repo?: string; number: number }) => {
	const owner = input.owner ?? "acme";
	const repo = input.repo ?? "web";
	return {
		owner,
		repo,
		number: input.number,
		url: `https://github.com/${owner}/${repo}/pull/${input.number}`,
		title: `PR ${input.number}`,
		state: "open",
		isDraft: false,
		headRef: "feature",
		baseRef: "main",
		reviewState: "none",
		mergedAt: null,
		closedAt: null,
		checks: [],
		ciState: "none",
	};
};

export const spawnKey = (spawn: StubSpawn) => `${spawn.args[0]} ${spawn.args[1]}`;

const QUERY_REF = /repository\(owner: "([^"]+)", name: "([^"]+)"\)[^)]*pullRequest\(number: (\d+)\)/g;

const queryOf = (spawn: StubSpawn) => spawn.args.find((argument) => argument.startsWith("query="))!;

// `acme/web#12` for every pull request one graphql request asks about, in
// the order the query names them.
export const queriedRefs = (spawn: StubSpawn): string[] =>
	[...queryOf(spawn).matchAll(QUERY_REF)].map((match) => `${match[1]}/${match[2]}#${match[3]}`);

export const aliasCount = (spawn: StubSpawn) => queryOf(spawn).match(/\bpr\d+: repository\(/g)?.length ?? 0;

export const refKey = (owner: string, repo: string, number: number) => `${owner}/${repo}#${number}`;

export type StubRepliesInput = Record<string, StubReply>;

export type PollerHarness = {
	clock: FakeTimerClock;
	hook: PollerHook;
	events: TrellisEvent[];
	logs: unknown[][];
	stub: GhStubHandle;
	spawns: () => StubSpawn[];
	spawnsOf: (key: string) => StubSpawn[];
	countOf: (key: string) => number;
	restore: () => void;
};

// One gh stub, one fake clock, and the hook that ties them to the database.
// A signed in `gh auth status` and a full budget answer unless the test
// names its own reply. `bin` points the runner at a path with no file, which
// is how a test drives a missing gh binary.
export const pollerHarness = (
	db: TestDb["db"],
	replies: Record<string, StubReply>,
	options: { bin?: string } = {},
): PollerHarness => {
	const answers = { "auth status": authReply, "api rate_limit": rateLimitReply(5000), ...replies };
	const stub = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-poller-")), answers);
	if (options.bin !== undefined) process.env.TRELLIS_GH_BIN = options.bin;
	const clock = fakeTimerClock(BASE);
	const events: TrellisEvent[] = [];
	const logs: unknown[][] = [];
	const spawnsOf = (key: string) => stub.spawns().filter((spawn) => spawnKey(spawn) === key);
	return {
		clock,
		events,
		logs,
		stub,
		spawns: stub.spawns,
		spawnsOf,
		countOf: (key) => spawnsOf(key).length,
		restore: stub.restore,
		hook: {
			db,
			gh: createGhRunner(),
			sink: (batch) => void events.push(...batch),
			log: (...line) => void logs.push(line),
			now: clock.now,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		},
	};
};

export type LinkedPrInput = {
	projectId: string;
	rootId: string;
	statusId: string;
	pr: PrSeed;
	row?: Row;
	ticketNumber?: number;
};

// One ticket and one pull request linked to it, as a person linked it.
export const seedLinkedPr = async (db: TestDb["db"], input: LinkedPrInput) => {
	const ticket = await seedTicket(db, {
		projectId: input.projectId,
		rootId: input.rootId,
		statusId: input.statusId,
		number: input.ticketNumber,
	});
	const pr = await seedPr(db, input.pr, input.row);
	await linkPr(db, ticket, pr);
	return { ticket, pr };
};
