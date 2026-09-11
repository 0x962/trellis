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

const DANA: ActorRef = { kind: "human", name: "dana" };
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
let dispatcher: Dispatcher;

beforeEach(() => {
	bus = createBus({ bootId: ulid() });
	clock = fakeTimerClock(new Date("2026-09-10T12:00:00.000Z"));
	batches = [];
	dispatcher = createDispatcher({
		bus,
		clock,
		scope: (projectId) => (projectId === CDE ? [CDE, CDE_WEB] : [projectId]),
		path: (projectId) => (projectId === CDE ? "CDE" : "OPS"),
		flush: (batch) => {
			batches.push(batch);
		},
	});
	dispatcher.watch(CDE);
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

const change = (n: number, actor: ActorRef = DANA) => bus.emit(ticket(n, ["title"]), actor);

describe("dispatcher batches", () => {
	test("the 10 s timer restarts on each new event, then one batch holds every change", async () => {
		commentOn(1, DANA);
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
		commentOn(1, DANA);
		bus.emit(ticket(2, ["status"], { status: "Agent Review" }), BUILDER);
		await clock.advance(10_000);
		expect(batches).toEqual([
			{
				projectId: CDE,
				count: 2,
				text: "trellis: 2 changes in CDE (CDE-1 commented by dana, CDE-2 moved to Agent Review by builder-cde-2). Run: trellis list --project CDE --json",
			},
		]);
		for (const n of [1, 2, 3, 4, 5]) change(n);
		await clock.advance(10_000);
		expect(batches[1]!.text).toBe(
			"trellis: 5 changes in CDE (CDE-1 updated by dana, CDE-2 updated by dana, CDE-3 updated by dana, and 2 more). Run: trellis list --project CDE --json",
		);
		change(1);
		await clock.advance(10_000);
		expect(batches[2]!.text).toBe(
			"trellis: 1 change in CDE (CDE-1 updated by dana). Run: trellis list --project CDE --json",
		);
	});
});

describe("dispatcher relevance", () => {
	test("human, builder, reviewer, PR, and CI changes in the project's subtree count; nothing else does", async () => {
		// Counted: a human in a sub-project, a reviewer, a builder, and the
		// poller's CI change with no actor.
		bus.emit(ticket(1, ["title"], { projectId: CDE_WEB }), DANA);
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
		bus.emit(ticket(4, ["title"], { projectId: OPS }), DANA);
		bus.emit({ type: "project.updated", id: CDE }, DANA);
		bus.emit({ type: "gh.status", ok: false, reason: "missing" });
		bus.emit({ type: "agents.batch", projectId: CDE, count: 3 });
		await clock.advance(10_000);
		expect(batches).toHaveLength(1);
		expect(batches[0]!.count).toBe(4);
		expect(batches[0]!.text).toBe(
			"trellis: 4 changes in CDE (CDE-1 updated by dana, CDE-2 updated by reviewer-cde-2, CDE-2 attachment added by builder-cde-2, and 1 more). Run: trellis list --project CDE --json",
		);
	});

	test("a PR change names the ticket the dispatcher has seen, and a status set change names who made it", async () => {
		change(1, OTHER_AGENT);
		bus.emit(
			{ type: "pr.linked", id: ulid(), ticketIds: [TICKETS[1]!], projectIds: [CDE], state: "open", ciState: "none" },
			DANA,
		);
		bus.emit({
			type: "pr.updated",
			id: ulid(),
			ticketIds: [TICKETS[5]!],
			projectIds: [CDE],
			state: "merged",
			ciState: "pass",
		});
		bus.emit({ type: "statuses.changed", projectId: CDE }, DANA);
		await clock.advance(10_000);
		expect(batches[0]!.text).toBe(
			"trellis: 3 changes in CDE (PR linked to CDE-1, PR on a ticket merged, CI pass, statuses changed by dana). Run: trellis list --project CDE --json",
		);
	});
});

describe("dispatcher watch", () => {
	test("each watched project batches on its own, and unwatch drops the queue and the timer", async () => {
		dispatcher.watch(OPS);
		change(1);
		bus.emit(ticket(4, ["title"], { projectId: OPS }), DANA);
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

describe("dispatcher recent batches", () => {
	test("keeps the last 20 batches, newest first, with the time, the project, the count, and the pointer text", async () => {
		for (let n = 1; n <= 21; n++) {
			change(1);
			await clock.advance(10_000);
		}
		const recent = dispatcher.recent();
		expect(recent).toHaveLength(20);
		expect(recent[0]).toEqual({ at: clock.now().toISOString(), projectId: CDE, count: 1, text: batches.at(-1)!.text });
		const times = recent.map((batch) => batch.at);
		expect(times).toEqual([...times].sort().reverse());
	});
});
