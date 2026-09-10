import type { GhReason, TrellisEvent } from "@trellis/api";
import { withTx } from "../db/tx.ts";
import { run as detect } from "./detect.ts";
import { fetchPullRequests } from "./graphql.ts";
import { type DueRow, isDue, refOf, selectCandidates } from "./pollerDue.ts";
import { type Polled, type PolledFailure, writePolled } from "./pollerWrite.ts";
import { readRateLimit } from "./ratelimit.ts";
import type { GhRunner } from "./run.ts";

// The poller is one setTimeout chain. A tick runs every 10 s, one tick runs
// at a time, and the next timer is armed when the running tick settles. Each
// tick reads the gh state, reads the rate limit budget, fetches the pull
// requests that are due, and runs auto-detection on its own interval.
//
// gh that is missing or signed out is a state, not a crash: the tick then
// does nothing but recheck once a minute, and one event and one log line
// mark each change of that state.

type Db = Parameters<typeof withTx>[0];

// What a boot hands the poller. `setTimer` and `clearTimer` stand in for
// setTimeout and clearTimeout, so a test drives the chain with its own
// clock.
export type PollerHook = {
	db: Db;
	gh: GhRunner;
	sink: (events: TrellisEvent[]) => void;
	log: (...line: unknown[]) => void;
	now: () => Date;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
};

export type PollerHandle = { tick: () => Promise<void>; stop: () => Promise<void> };

export const TICK_MS = 10_000;
export const AUTH_RECHECK_MS = 60_000;
export const RATE_LIMIT_MS = 300_000;
export const DETECT_MS = 120_000;

// GitHub answers up to 50 aliased pull requests in one graphql request, so
// one tick spawns one gh process per 50 due pull requests.
export const BATCH_SIZE = 50;

// `checkedAt` is the clock reading of the last `gh auth status` call.
// `rateReadAt` is the reading of the last budget read. `multiplier`
// stretches every interval while the budget is low. `lastFetch` holds the
// reading of the last fetch of each pull request, because a fetch that finds
// the same content writes no row.
type PollerState = {
	ok: boolean;
	reason: GhReason | null;
	checkedAt: number | null;
	rateReadAt: number;
	multiplier: number;
	lowBudget: boolean;
	detectAt: number | null;
	lastFetch: Map<string, number>;
	failingRepos: Map<string, string>;
};

// One gh.status event and one log line per change. A state that holds writes
// nothing more, so a gh that stays signed out never fills the log.
const setGhState = (hook: PollerHook, state: PollerState, reason: GhReason | null) => {
	const ok = reason === null;
	if (ok === state.ok && reason === state.reason) return;
	state.ok = ok;
	state.reason = reason;
	hook.sink([ok ? { type: "gh.status", ok } : { type: "gh.status", ok, reason: reason! }]);
	hook.log("gh", { ok, reason });
};

// Reports whether gh answers and is signed in. A bad state is rechecked at
// most once per 60 s, so a signed out gh costs one call a minute and the
// tick stops there.
const checkGh = async (hook: PollerHook, state: PollerState, atMs: number) => {
	if (state.ok && state.checkedAt !== null) return true;
	if (state.checkedAt !== null && atMs - state.checkedAt < AUTH_RECHECK_MS) return false;
	const result = await hook.gh("poller", ["auth", "status"]);
	state.checkedAt = atMs;
	setGhState(hook, state, result.ok ? null : result.reason);
	return state.ok;
};

// The budget is read at most once every 5 minutes. Under 20 percent
// remaining every interval is multiplied by 4, and one gh.status event marks
// the change into that state and the change back.
const readBudget = async (hook: PollerHook, state: PollerState, atMs: number) => {
	if (atMs - state.rateReadAt < RATE_LIMIT_MS) return;
	state.rateReadAt = atMs;
	const result = await readRateLimit(hook.gh);
	if (!result.ok) return;
	state.multiplier = result.multiplier;
	const low = result.multiplier > 1;
	if (low === state.lowBudget) return;
	state.lowBudget = low;
	hook.sink([{ type: "gh.status", ok: true }]);
};

// The map holds one reading per pull request the poller still watches. A
// pull request that left the due set drops out, so the map stays the size of
// the watched set.
const dropStale = (state: PollerState, candidates: DueRow[]) => {
	const live = new Set(candidates.map((row) => row.id));
	for (const id of state.lastFetch.keys()) if (!live.has(id)) state.lastFetch.delete(id);
};

// Fetches one batch and writes what gh answered. Returns false when gh
// itself failed, which stops the tick and reports the new gh state.
const fetchBatch = async (hook: PollerHook, state: PollerState, at: Date, batch: DueRow[]) => {
	const result = await fetchPullRequests(hook.gh, batch.map(refOf), "poller");
	if (!result.ok) {
		setGhState(hook, state, result.reason);
		return false;
	}
	const written: Polled[] = [];
	const failed: PolledFailure[] = [];
	for (const [index, entry] of result.results.entries()) {
		const stored = batch[index]!;
		state.lastFetch.set(stored.id, at.getTime());
		if (!("row" in entry)) failed.push({ id: stored.id, error: entry.error });
		else if (entry.row.contentHash !== stored.content_hash) written.push({ stored, row: entry.row });
	}
	await withTx(hook.db, (tx, emit) => writePolled(tx, emit, { at, written, failed }), hook.sink);
	return true;
};

const pollDue = async (hook: PollerHook, state: PollerState, at: Date) => {
	const { result: candidates } = await withTx(hook.db, (tx) => selectCandidates(tx, at));
	dropStale(state, candidates);
	const atMs = at.getTime();
	const due = candidates.filter((row) => isDue(row, state.lastFetch.get(row.id) ?? null, atMs, state.multiplier));
	for (let start = 0; start < due.length; start += BATCH_SIZE) {
		const ok = await fetchBatch(hook, state, at, due.slice(start, start + BATCH_SIZE));
		if (!ok) return;
	}
};

// Auto-detection runs on the first tick and then every 120 s. A low budget
// stretches that interval as it stretches the poll intervals.
const detectDue = async (hook: PollerHook, state: PollerState, atMs: number) => {
	if (state.detectAt !== null && atMs - state.detectAt < DETECT_MS * state.multiplier) return;
	state.detectAt = atMs;
	await detect(hook, state.failingRepos);
};

const tick = async (hook: PollerHook, state: PollerState) => {
	const at = hook.now();
	const atMs = at.getTime();
	if (!(await checkGh(hook, state, atMs))) return;
	await readBudget(hook, state, atMs);
	await pollDue(hook, state, at);
	await detectDue(hook, state, atMs);
};

export const start = (hook: PollerHook): PollerHandle => {
	const state: PollerState = {
		ok: true,
		reason: null,
		checkedAt: null,
		rateReadAt: hook.now().getTime(),
		multiplier: 1,
		lowBudget: false,
		detectAt: null,
		lastFetch: new Map(),
		failingRepos: new Map(),
	};
	let running: Promise<void> | null = null;
	let timer: number | null = null;
	let stopped = false;

	// A caller who ticks by hand while a tick runs waits for that tick. The
	// running tick arms the next timer when it settles, so two ticks never
	// overlap and the chain never doubles.
	const runTick = (): Promise<void> => {
		if (running !== null) return running;
		running = tick(hook, state).finally(() => {
			running = null;
			if (!stopped) arm();
		});
		return running;
	};

	const arm = () => {
		if (timer !== null) hook.clearTimer(timer);
		timer = hook.setTimer(runTick, TICK_MS);
	};

	arm();
	return {
		tick: runTick,
		stop: async () => {
			stopped = true;
			if (timer !== null) hook.clearTimer(timer);
			await running;
		},
	};
};
