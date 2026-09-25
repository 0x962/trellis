import type { GhReason, TrellisEvent } from "@trellis/api";
import { type ServiceCtx, SYSTEM_ACTOR } from "../context.ts";
import type { ProjectCache } from "../db/cache.ts";
import { withTx } from "../db/tx.ts";
import { completeMergedPullRequestTickets } from "../services/tickets/completeMergedPullRequests.ts";
import { fetchPullRequests } from "./graphql.ts";
import { type DueRow, isDue, refOf, selectCandidates } from "./pollerDue.ts";
import { noticePullRequests } from "./pollerNotices.ts";
import { type Polled, type PolledFailure, storeFetchErrors, writePolled } from "./pollerWrite.ts";
import { readRateLimit } from "./ratelimit.ts";
import type { GhRunner } from "./run.ts";

// The poller is one setTimeout chain. A tick runs every 10 s, one tick runs
// at a time, and the next timer is armed when the running tick settles. Each
// tick reads the gh state, reads the rate limit budget, fetches the pull
// requests that are due, and queues the check notices for their agents.
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
	cache: ProjectCache;
	actorCache: Map<string, number>;
	publicUrl: string;
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

// Each request includes up to 100 check contexts per pull request.
// Ten pull requests limit the work in each nested check query.
export const BATCH_SIZE = 10;

// `checkedAt` is the clock reading of the last `gh auth status` call.
// `rateReadAt` is the reading of the last budget read. `multiplier`
// stretches every interval while the budget is low. `lastFetch` holds the
// reading of the last fetch of each pull request, because a fetch that finds
// the same content writes no row. `rateShapeLogged` is true after the first
// rate_limit reply without a budget, so a host that never sends one writes
// one log line and not one every 5 minutes.
type PollerState = {
	ok: boolean;
	reason: GhReason | null;
	checkedAt: number | null;
	rateReadAt: number;
	multiplier: number;
	lowBudget: boolean;
	rateShapeLogged: boolean;
	lastFetch: Map<string, number>;
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
// the change into that state and the change back. A reply without a budget
// keeps the multiplier it finds. The log keeps the first 2000 characters of
// that reply.
const readBudget = async (hook: PollerHook, state: PollerState, atMs: number) => {
	if (atMs - state.rateReadAt < RATE_LIMIT_MS) return;
	state.rateReadAt = atMs;
	const result = await readRateLimit(hook.gh);
	if (!result.ok && result.reason === "shape" && !state.rateShapeLogged) {
		state.rateShapeLogged = true;
		hook.log("gh rate_limit reply has an unexpected shape", { stdout: result.stdout.slice(0, 2000) });
	}
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
// is missing or signed out, which stops the tick and reports the new gh state.
const fetchBatch = async (hook: PollerHook, state: PollerState, at: Date, batch: DueRow[]) => {
	const result = await fetchPullRequests(hook.gh, batch.map(refOf), "poller");
	if (!result.ok) {
		if (result.reason === "error") {
			for (const row of batch) state.lastFetch.set(row.id, at.getTime());
			await withTx(hook.db, (tx) =>
				storeFetchErrors(
					tx,
					batch.map((row) => ({ id: row.id, error: result.message })),
				),
			);
			hook.log("PR batch fetch failed", { message: result.message, refs: batch.map(refOf) });
			return true;
		}
		setGhState(hook, state, result.reason);
		return false;
	}
	const written: Polled[] = [];
	const failed: PolledFailure[] = [];
	for (const [index, entry] of result.results.entries()) {
		const stored = batch[index]!;
		state.lastFetch.set(stored.id, at.getTime());
		if (!("row" in entry)) failed.push({ id: stored.id, error: entry.error });
		else if (entry.row.contentHash !== stored.content_hash || stored.fetch_error !== null)
			written.push({ stored, row: entry.row });
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

const serviceCtx = (hook: PollerHook, emit: (event: TrellisEvent) => void, at: Date): ServiceCtx => ({
	actor: SYSTEM_ACTOR,
	session: null,
	reqId: "gh-poller",
	now: at,
	cache: hook.cache,
	actorCache: hook.actorCache,
	emit,
	dropBlobs: () => {},
	publicUrl: hook.publicUrl,
});

const tick = async (hook: PollerHook, state: PollerState) => {
	const at = hook.now();
	const atMs = at.getTime();
	if (!(await checkGh(hook, state, atMs))) return;
	await readBudget(hook, state, atMs);
	await pollDue(hook, state, at);
	await noticePullRequests(hook.db, hook.gh, at, hook.log);
	await withTx(hook.db, (tx, emit) => completeMergedPullRequestTickets(serviceCtx(hook, emit, at), tx), hook.sink);
};

export const start = (hook: PollerHook): PollerHandle => {
	const state: PollerState = {
		ok: true,
		reason: null,
		checkedAt: null,
		rateReadAt: hook.now().getTime(),
		multiplier: 1,
		lowBudget: false,
		rateShapeLogged: false,
		lastFetch: new Map(),
	};
	let running: Promise<void> | null = null;
	let timer: number | null = null;
	let stopped = false;

	// A caller who ticks by hand while a tick runs waits for that tick. The
	// running tick arms the next timer when it settles, so two ticks never
	// overlap and the chain never doubles. The poller runs on the database
	// worker, and a rejected tick there stops the worker. So a tick that
	// throws writes one log line, and the next timer still arms.
	const runTick = (): Promise<void> => {
		if (running !== null) return running;
		running = tick(hook, state)
			.catch((error: Error) => hook.log("poller tick failed", { message: error.message, stack: error.stack }))
			.finally(() => {
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
