import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ActorRef, TrellisEvent } from "@trellis/api";
import { ulid } from "ulid";
import { commentEvent, ticketEvent } from "../../test/fixtures/events.ts";
import { type FakeTimerClock, fakeTimerClock } from "../../test/helpers/clock.ts";
import { type Bus, createBus } from "../events/bus.ts";
import { type Batch, createDispatcher, type Dispatcher } from "./dispatcher.ts";

// The dispatcher queues the changes a project's manager must hear about and
// wakes the manager with one pointer per batch. These tests drive a real
// bus and a fake clock, so no test waits in real time.

const NAVID: ActorRef = { kind: "human", name: "navid" };
const MANAGER: ActorRef = { kind: "agent", name: "manager-cde" };
const BUILDER: ActorRef = { kind: "agent", name: "builder-cde-2" };
const REVIEWER: ActorRef = { kind: "agent", name: "reviewer-cde-2" };
const OTHER_AGENT: ActorRef = { kind: "agent", name: "claude-code" };

const CDE = ulid();
const CDE_WEB = ulid();
const OPS = ulid();
const TICKETS = [ulid(), ulid(), ulid(), ulid(), ulid(), ulid()];

let bus: Bus;
let clock: FakeTimerClock;
let batches: Batch[];
let pings: string[];
let dispatcher: Dispatcher;

beforeEach(() => {
	bus = createBus({ bootId: ulid() });
	clock = fakeTimerClock(new Date("2026-09-10T12:00:00.000Z"));
	batches = [];
	pings = [];
	dispatcher = createDispatcher({
		bus,
		clock,
		scope: (projectId) => (projectId === CDE ? [CDE, CDE_WEB] : [projectId]),
		path: (projectId) => (projectId === CDE ? "CDE" : "OPS"),
		flush: (batch) => {
			batches.push(batch);
		},
		ping: (projectId) => {
			pings.push(projectId);
		},
	});
	dispatcher.watch(CDE, null);
});
afterEach(() => dispatcher.stop());

// A ticket event for ticket `n` of CDE, as `ticket.updated` with `fields`.
const ticket = (n: number, fields: string[], options: { status?: string; projectId?: string } = {}) => {
	const base = ticketEvent("ticket.updated", { ticketId: TICKETS[n], projectId: options.projectId ?? CDE });
	if (base.type !== "ticket.updated") throw new Error("ticketEvent returned another type");
	const status = { ...base.summary.status, name: options.status ?? "Todo" };
	return { ...base, fields, summary: { ...base.summary, identifier: `CDE-${n}`, status } } satisfies TrellisEvent;
};

// A comment on ticket `n` and the ticket.updated for its comment count, in
// the order the comments service emits them.
const commentOn = (n: number, actor: ActorRef) => {
	bus.emit({ ...commentEvent("comment.created", TICKETS[n]), projectId: CDE } as TrellisEvent, actor);
	bus.emit(ticket(n, ["commentCount"]), actor);
};

const change = (n: number, actor: ActorRef = NAVID) => bus.emit(ticket(n, ["title"]), actor);

describe("dispatcher batches", () => {
	test("the 10 s timer restarts on each new event, then one batch holds every change", async () => {
		commentOn(1, NAVID);
		await clock.advance(9_000);
		change(2);
		await clock.advance(9_000);
		expect(batches).toEqual([]);
		await clock.advance(1_000);
		expect(batches.map((batch) => batch.count)).toEqual([2]);
	});

	test("the 10th queued change flushes at once, and the next change starts a new batch", async () => {
		for (let n = 0; n < 10; n++) change(n % 6);
		expect(batches.map((batch) => batch.count)).toEqual([10]);
		expect(clock.timers()).toEqual([]);
		change(1);
		expect(clock.timers()).toHaveLength(1);
		await clock.advance(10_000);
		expect(batches.map((batch) => batch.count)).toEqual([10, 1]);
	});

	test("the manager's own changes never queue", async () => {
		change(1, MANAGER);
		commentOn(2, MANAGER);
		bus.emit({ type: "statuses.changed", projectId: CDE }, MANAGER);
		await clock.advance(10_000);
		expect(batches).toEqual([]);
		expect(clock.timers()).toEqual([]);
	});

	test("a flush wakes once with a pointer that counts the changes and names the first three", async () => {
		commentOn(1, NAVID);
		bus.emit(ticket(2, ["status"], { status: "Agent Review" }), BUILDER);
		await clock.advance(10_000);
		expect(batches).toEqual([
			{
				projectId: CDE,
				count: 2,
				text: "trellis: 2 changes in CDE (CDE-1 commented by navid, CDE-2 moved to Agent Review by builder-cde-2). Run: trellis agents inbox --project CDE",
			},
		]);
		for (const n of [1, 2, 3, 4, 5]) change(n);
		await clock.advance(10_000);
		expect(batches[1]!.text).toBe(
			"trellis: 5 changes in CDE (CDE-1 updated by navid, CDE-2 updated by navid, CDE-3 updated by navid, and 2 more). Run: trellis agents inbox --project CDE",
		);
		change(1);
		await clock.advance(10_000);
		expect(batches[2]!.text).toBe(
			"trellis: 1 change in CDE (CDE-1 updated by navid). Run: trellis agents inbox --project CDE",
		);
	});
});

describe("dispatcher relevance", () => {
	test("human, builder, reviewer, PR, and CI changes in the project's subtree count; nothing else does", async () => {
		// Counted: a human in a sub-project, a reviewer, a builder, and the
		// poller's CI change with no actor.
		bus.emit(ticket(1, ["title"], { projectId: CDE_WEB }), NAVID);
		bus.emit(ticket(2, ["priority"]), REVIEWER);
		bus.emit({ type: "attachment.created", id: ulid(), ticketId: TICKETS[2]!, projectId: CDE }, BUILDER);
		bus.emit({
			type: "pr.updated",
			id: ulid(),
			ticketIds: [TICKETS[1]!],
			projectIds: [CDE_WEB],
			state: "open",
			ciState: "fail",
		});
		// Not counted: another agent, another project, a project rename, the gh
		// state, and the agents events trellis itself emits.
		change(3, OTHER_AGENT);
		bus.emit(ticket(4, ["title"], { projectId: OPS }), NAVID);
		bus.emit({ type: "project.updated", id: CDE }, NAVID);
		bus.emit({ type: "gh.status", ok: false, reason: "missing" });
		bus.emit({ type: "agents.batch", projectId: CDE, count: 3 });
		await clock.advance(10_000);
		expect(batches).toHaveLength(1);
		expect(batches[0]!.count).toBe(4);
		expect(batches[0]!.text).toBe(
			"trellis: 4 changes in CDE (CDE-1 updated by navid, CDE-2 updated by reviewer-cde-2, CDE-2 attachment added by builder-cde-2, and 1 more). Run: trellis agents inbox --project CDE",
		);
	});

	test("a PR change names the ticket the dispatcher has seen, and a status set change names who made it", async () => {
		change(1, OTHER_AGENT);
		bus.emit(
			{ type: "pr.linked", id: ulid(), ticketIds: [TICKETS[1]!], projectIds: [CDE], state: "open", ciState: "none" },
			NAVID,
		);
		bus.emit({
			type: "pr.updated",
			id: ulid(),
			ticketIds: [TICKETS[5]!],
			projectIds: [CDE],
			state: "merged",
			ciState: "pass",
		});
		bus.emit({ type: "statuses.changed", projectId: CDE }, NAVID);
		await clock.advance(10_000);
		expect(batches[0]!.text).toBe(
			"trellis: 3 changes in CDE (PR linked to CDE-1, PR on a ticket merged, CI pass, statuses changed by navid). Run: trellis agents inbox --project CDE",
		);
	});
});

describe("dispatcher watch", () => {
	test("each watched project batches on its own, and unwatch drops the queue and the timer", async () => {
		dispatcher.watch(OPS, null);
		change(1);
		bus.emit(ticket(4, ["title"], { projectId: OPS }), NAVID);
		expect(clock.timers()).toHaveLength(2);
		dispatcher.unwatch(OPS);
		expect(clock.timers()).toHaveLength(1);
		await clock.advance(10_000);
		expect(batches.map((batch) => [batch.projectId, batch.count])).toEqual([[CDE, 1]]);
		dispatcher.unwatch(CDE);
		change(1);
		await clock.advance(10_000);
		expect(batches).toHaveLength(1);
	});

	test("stop clears every timer and ignores later events", async () => {
		change(1);
		expect(clock.timers()).toHaveLength(1);
		dispatcher.stop();
		expect(clock.timers()).toEqual([]);
		change(2);
		await clock.advance(10_000);
		expect(batches).toEqual([]);
		expect(dispatcher.watched()).toEqual([]);
	});
});

// The heartbeat gives the manager a turn while nothing changes. The
// interval comes from the project's settings, in milliseconds.
describe("dispatcher heartbeat", () => {
	const HEARTBEAT_MS = 60_000;

	test("the heartbeat pings on the configured interval and keeps pinging", async () => {
		dispatcher.watch(CDE, HEARTBEAT_MS);
		await clock.advance(59_000);
		expect(pings).toEqual([]);
		await clock.advance(1_000);
		expect(pings).toEqual([CDE]);
		await clock.advance(120_000);
		expect(pings).toEqual([CDE, CDE, CDE]);
	});

	test("a batch resets the heartbeat, so the manager gets no ping right after it answered", async () => {
		dispatcher.watch(CDE, HEARTBEAT_MS);
		await clock.advance(50_000);
		change(1);
		await clock.advance(10_000);
		expect(batches).toHaveLength(1);
		expect(pings).toEqual([]);
		await clock.advance(49_000);
		expect(pings).toEqual([]);
		await clock.advance(1_000);
		expect(pings).toEqual([CDE]);
	});

	test("a null interval arms no heartbeat, and a watch with a new interval replaces the old one", async () => {
		await clock.advance(600_000);
		expect(pings).toEqual([]);
		dispatcher.watch(CDE, HEARTBEAT_MS);
		dispatcher.watch(CDE, 15_000);
		await clock.advance(15_000);
		expect(pings).toEqual([CDE]);
		dispatcher.watch(CDE, null);
		await clock.advance(600_000);
		expect(pings).toEqual([CDE]);
	});

	test("unwatch and stop clear the heartbeat", async () => {
		dispatcher.watch(CDE, HEARTBEAT_MS);
		dispatcher.watch(OPS, HEARTBEAT_MS);
		dispatcher.unwatch(OPS);
		await clock.advance(60_000);
		expect(pings).toEqual([CDE]);
		dispatcher.stop();
		expect(clock.timers()).toEqual([]);
		await clock.advance(600_000);
		expect(pings).toEqual([CDE]);
	});
});
