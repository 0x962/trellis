import { describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import { prEvent, projectEvent, ticketEvent } from "../../test/fixtures";
import { type BusEntry, createBus } from "./bus.ts";

// The bus numbers every event `<bootId>.<seq>`, keeps the last 1000 in a
// ring, and replays from an id with `since`. A null from `since` tells the
// SSE route to send `reset`: the id came from another boot, or the event
// after it fell out of the ring.

const bootId = ulid();

const ids = (entries: BusEntry[]) => entries.map((entry) => entry.id);

const emitMany = (bus: ReturnType<typeof createBus>, count: number) => {
	const entries: BusEntry[] = [];
	for (let i = 0; i < count; i += 1) entries.push(bus.emit(projectEvent("project.updated")));
	return entries;
};

describe("event bus ids", () => {
	test("an event envelope holds its id, sequence, and payload", () => {
		const bus = createBus({ bootId });
		const event = projectEvent("project.created");
		expect(bus.emit(event)).toEqual({ id: `${bootId}.0`, seq: 0, event });
	});

	test("the first event id is bootId.0 and the sequence rises by one", () => {
		const bus = createBus({ bootId });
		const first = bus.emit(projectEvent("project.created"));
		const second = bus.emit(projectEvent("project.updated"));
		const third = bus.emit(ticketEvent("ticket.created"));
		expect(first.id).toBe(`${bootId}.0`);
		expect(second.id).toBe(`${bootId}.1`);
		expect(third.id).toBe(`${bootId}.2`);
		expect(bus.bootId).toBe(bootId);
	});
});

describe("event bus subscribe", () => {
	test("subscribe delivers in order and unsubscribe stops delivery", () => {
		const bus = createBus({ bootId });
		const received: BusEntry[] = [];
		const unsubscribe = bus.subscribe((entry) => {
			received.push(entry);
		});
		const first = bus.emit(projectEvent("project.created"));
		const second = bus.emit(ticketEvent("ticket.updated"));
		unsubscribe();
		bus.emit(prEvent("pr.updated"));
		expect(received).toEqual([first, second]);
		expect(received.map((entry) => entry.event.type)).toEqual(["project.created", "ticket.updated"]);
	});
});

describe("event bus since", () => {
	test("since replays every event after the given id", () => {
		const bus = createBus({ bootId });
		const entries = emitMany(bus, 5);
		const replay = bus.since(entries[1]!.id);
		expect(replay).not.toBeNull();
		expect(ids(replay!)).toEqual([`${bootId}.2`, `${bootId}.3`, `${bootId}.4`]);
		expect(replay).toEqual(entries.slice(2));
	});

	test("since on the newest id returns an empty array", () => {
		const bus = createBus({ bootId });
		const entries = emitMany(bus, 5);
		expect(bus.since(entries[4]!.id)).toEqual([]);
	});

	test("since returns null for an id from another boot", () => {
		const bus = createBus({ bootId });
		emitMany(bus, 5);
		expect(bus.since(`${ulid()}.3`)).toBeNull();
	});

	test("the ring holds the last 1000 events", () => {
		const bus = createBus({ bootId });
		const entries = emitMany(bus, 1001);
		const replay = bus.since(`${bootId}.0`);
		expect(replay).not.toBeNull();
		expect(replay).toHaveLength(1000);
		expect(replay![0]!.id).toBe(`${bootId}.1`);
		expect(replay![999]!.id).toBe(`${bootId}.1000`);
		expect(replay).toEqual(entries.slice(1));
	});

	test("since returns null below the ring floor", () => {
		const bus = createBus({ bootId });
		emitMany(bus, 1002);
		expect(bus.since(`${bootId}.0`)).toBeNull();
		expect(bus.since(`${bootId}.1`)).toHaveLength(1000);
	});

	test("the ring keeps an event no subscriber wants", () => {
		const bus = createBus({ bootId });
		const received: BusEntry[] = [];
		bus.subscribe(
			(entry) => {
				received.push(entry);
			},
			{ types: ["pr.*"] },
		);
		const earlier = bus.emit(projectEvent("project.updated"));
		const ticket = bus.emit(ticketEvent("ticket.updated"));
		expect(received).toEqual([]);
		expect(bus.since(earlier.id)).toEqual([ticket]);
	});
});
