import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/query-core";
import {
	boardKey,
	boardPage,
	cached,
	createdEvent,
	detailKey,
	inboxKey,
	listKey,
	listPage,
	type Summary,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";
import { createFakeScheduler } from "../test/fakeScheduler.ts";
import { queryKey, statusSummary, t1, t2, ticket } from "../test/fixtures.ts";
import { createEventApplier } from "./query-keys.ts";

// A seeded generator, so a failing sequence replays from its seed alone.
const createRandom = (seed: number) => {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

type Random = () => number;
const pick = <T>(random: Random, items: readonly T[]) => items[Math.floor(random() * items.length)]!;
const shuffle = <T>(random: Random, items: readonly T[]) => {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
};

const FIELDS = ["title", "status", "priority", "description", "parent"] as const;
const PRIORITIES = ["none", "urgent", "high", "medium", "low"] as const;
const VERSIONS = Array.from({ length: 12 }, (_, index) => index + 1);

// One summary per version, with a distinct value in every generated field.
// The cached row at version v must equal this summary, field by field.
const summaryFor = (random: Random, version: number): Summary =>
	summaryAt(version, {
		title: `Title ${version}`,
		priority: pick(random, PRIORITIES),
		status: statusSummary({ slug: `status-${Math.floor(random() * 4)}` }),
		parent: random() < 0.5 ? null : { id: t2, identifier: "CDE-43" },
	});

const searchKey = queryKey(["search", "query"], { q: "title" });
const byUlidKey = queryKey(["tickets", "get"], { ticket: t1 });

// Every cached shape that holds the ticket. `seed` builds the entry from a
// summary and a description text; `row` reads the ticket's row back out.
type Entry = {
	key: unknown[];
	detail: boolean;
	seed: (summary: Summary, text: string) => unknown;
	row: (data: unknown) => unknown;
};
const ENTRIES: Record<string, Entry> = {
	list: { key: listKey, detail: false, seed: (s) => listPage(s), row: (d) => (d as { items: unknown[] }).items[0] },
	board: {
		key: boardKey,
		detail: false,
		seed: (s) => boardPage(s),
		row: (d) => (d as { columns: { items: unknown[] }[] }).columns[0]!.items[0],
	},
	inbox: {
		key: inboxKey,
		detail: false,
		seed: (s) => ({ review: { items: [s], total: 1 } }),
		row: (d) => (d as { review: { items: unknown[] } }).review.items[0],
	},
	search: {
		key: searchKey,
		detail: false,
		seed: (s) => ({ tickets: [s], projects: [] }),
		row: (d) => (d as { tickets: unknown[] }).tickets[0],
	},
	detail: { key: detailKey, detail: true, seed: (s, text) => ticket({ ...s, description: text }), row: (d) => d },
	detailByUlid: { key: byUlidKey, detail: true, seed: (s, text) => ticket({ ...s, description: text }), row: (d) => d },
};
const ENTRY_NAMES = Object.keys(ENTRIES);

// What the rules say one entry must hold. `version` is the highest version
// applied to the entry. `textVersion` is the version of the description
// text the entry holds. `stale` is true once a description event above
// `textVersion` applied, until a refetch replaces the entry.
type Model = { version: number; textVersion: number; text: string; stale: boolean };

type Event = ReturnType<typeof updatedEvent> | ReturnType<typeof createdEvent>;

const runSequence = (seed: number) => {
	const random = createRandom(seed);
	const summaries = new Map(VERSIONS.map((version) => [version, summaryFor(random, version)]));
	const events: Event[] = shuffle(random, VERSIONS).map((version) => {
		const summary = summaries.get(version)!;
		if (version === 1) return createdEvent(summary);
		const fields = FIELDS.filter(() => random() < 0.4);
		return updatedEvent(summary, fields.length === 0 ? [pick(random, FIELDS)] : [...fields]);
	});

	const queryClient = new QueryClient();
	const seedVersion = 1 + Math.floor(random() * 4);
	const models = new Map<string, Model>();
	for (const name of ENTRY_NAMES) {
		const text = `Text ${seedVersion}`;
		queryClient.setQueryData(ENTRIES[name]!.key, ENTRIES[name]!.seed(summaries.get(seedVersion)!, text));
		models.set(name, { version: seedVersion, textVersion: seedVersion, text, stale: false });
	}
	const { scheduler, advanceTo } = createFakeScheduler();
	const applier = createEventApplier(queryClient, { scheduler });

	let clock = 0;
	let maxEmitted = 0;
	let inFlight = false;
	const held: Event[] = [];
	const log: string[] = [];

	const applyToModel = (event: Event) => {
		const version = event.summary.version;
		for (const name of ENTRY_NAMES) {
			const model = models.get(name)!;
			if (version <= model.version) continue;
			model.version = version;
			if (ENTRIES[name]!.detail && event.fields.includes("description") && version > model.textVersion) {
				model.stale = true;
			}
		}
	};

	const emit = (event: Event) => {
		maxEmitted = Math.max(maxEmitted, event.summary.version);
		applier.applyEvent(event);
		if (inFlight) held.push(event);
		else applyToModel(event);
	};

	const settle = () => {
		inFlight = false;
		applier.endMutation(t1);
		for (const event of held.sort((a, b) => a.summary.version - b.summary.version)) applyToModel(event);
		held.length = 0;
	};

	const refetch = (name: string) => {
		const version = Math.max(seedVersion, maxEmitted);
		const text = `Text ${version}`;
		queryClient.setQueryData(ENTRIES[name]!.key, ENTRIES[name]!.seed(summaries.get(version)!, text));
		models.set(name, { version, textVersion: version, text, stale: false });
	};

	const check = (step: number) => {
		for (const name of ENTRY_NAMES) {
			const entry = ENTRIES[name]!;
			const model = models.get(name)!;
			const summary = summaries.get(model.version)!;
			const expected = entry.detail
				? { ...ticket({ ...summary, description: model.text }), ...(model.stale ? { descriptionStale: true } : {}) }
				: summary;
			const where = `seed ${seed} step ${step} ${name}\n${log.join("\n")}`;
			expect(entry.row(cached(queryClient, entry.key)), where).toEqual(expected);
		}
	};

	let step = 0;
	let extraOps = 4;
	while (events.length > 0 || extraOps > 0 || inFlight) {
		const roll = random();
		if (events.length > 0 && roll < 0.5) {
			const event = events.shift()!;
			log.push(`event v${event.summary.version} ${event.fields.join(",")}${inFlight ? " (held)" : ""}`);
			emit(event);
		} else if (roll < 0.65) {
			if (inFlight) {
				log.push("endMutation");
				settle();
			} else {
				log.push("beginMutation");
				inFlight = true;
				applier.beginMutation(t1);
			}
			if (events.length === 0) extraOps -= 1;
		} else if (roll < 0.8) {
			clock += 4100;
			log.push(`flush at ${clock}`);
			advanceTo(clock);
			if (events.length === 0) extraOps -= 1;
		} else {
			const name = pick(random, ENTRY_NAMES);
			log.push(`refetch ${name}`);
			refetch(name);
			if (events.length === 0) extraOps -= 1;
		}
		clock += Math.floor(random() * 100);
		advanceTo(clock);
		step += 1;
		check(step);
	}
};

describe("applyEvent under random event sequences", () => {
	// Rule 1: an entry's version is the highest version applied to it, and
	// every field equals the summary at that version. Rule 2: a detail is
	// stale exactly after a description event above its text version, until
	// a refetch. Rule 4: held events apply in version order after settle.
	test("200 seeded sequences keep every entry at its highest applied version with the matching fields and flag", () => {
		for (let seed = 1; seed <= 200; seed += 1) runSequence(seed);
	});
});
