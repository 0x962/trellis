import { describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import { type BusEntry, createBus } from "./bus.ts";
import { commentEvent, everyServiceEvent, prEvent, statusesChanged, ticketEvent } from "../../test/fixtures";

// A subscriber and a replay take the same filter: `types` holds exact event
// names and `prefix.*` forms, `projectIds` and `ticketIds` narrow to the
// rows the SSE route resolved from `?project=` and `?ticket=`. The bus
// reads the scope of an event from its payload.

const bootId = ulid();

const collect = (bus: ReturnType<typeof createBus>, filter: Parameters<typeof bus.subscribe>[1]) => {
	const received: BusEntry[] = [];
	bus.subscribe((entry) => {
		received.push(entry);
	}, filter);
	return received;
};

const types = (entries: BusEntry[]) => entries.map((entry) => entry.event.type);

describe("event bus type filters", () => {
	test("an exact type filter delivers only that event name", () => {
		const bus = createBus({ bootId });
		const received = collect(bus, { types: ["ticket.updated"] });
		bus.emit(ticketEvent("ticket.created"));
		bus.emit(ticketEvent("ticket.updated"));
		bus.emit(prEvent("pr.updated"));
		expect(types(received)).toEqual(["ticket.updated"]);
	});

	test("a prefix type filter delivers every event of that prefix", () => {
		const bus = createBus({ bootId });
		const received = collect(bus, { types: ["ticket.*"] });
		bus.emit(ticketEvent("ticket.created"));
		bus.emit(ticketEvent("ticket.updated"));
		bus.emit(ticketEvent("ticket.deleted"));
		bus.emit(prEvent("pr.updated"));
		expect(types(received)).toEqual(["ticket.created", "ticket.updated", "ticket.deleted"]);
	});

	test("a type filter takes a list of names and prefixes", () => {
		const bus = createBus({ bootId });
		const received = collect(bus, { types: ["ticket.*", "pr.updated"] });
		bus.emit(ticketEvent("ticket.created"));
		bus.emit(prEvent("pr.updated"));
		bus.emit(commentEvent("comment.created"));
		expect(types(received)).toEqual(["ticket.created", "pr.updated"]);
	});

	test("an unknown type in a filter matches nothing", () => {
		const bus = createBus({ bootId });
		const received = collect(bus, { types: ["ticket.exploded"] });
		for (const event of everyServiceEvent()) bus.emit(event);
		expect(received).toEqual([]);
	});
});

describe("event bus scope filters", () => {
	test("a project scope filter drops events of another project", () => {
		const bus = createBus({ bootId });
		const p1 = ulid();
		const p2 = ulid();
		const received = collect(bus, { projectIds: [p1] });
		const first = bus.emit(ticketEvent("ticket.created", { projectId: p1 }));
		bus.emit(ticketEvent("ticket.created", { projectId: p2 }));
		const third = bus.emit(statusesChanged(p1));
		bus.emit(statusesChanged(p2));
		expect(received).toEqual([first, third]);
	});

	test("a ticket scope filter drops every event of another ticket", () => {
		const bus = createBus({ bootId });
		const t1 = ulid();
		const t2 = ulid();
		const received = collect(bus, { ticketIds: [t1] });
		const first = bus.emit(ticketEvent("ticket.updated", { ticketId: t1 }));
		bus.emit(ticketEvent("ticket.updated", { ticketId: t2 }));
		bus.emit(statusesChanged());
		expect(received).toEqual([first]);
	});

	test("the filters apply to a since replay as well as to live delivery", () => {
		const bus = createBus({ bootId });
		const p1 = ulid();
		const p2 = ulid();
		const start = bus.emit(statusesChanged(p2));
		const a = bus.emit(ticketEvent("ticket.created", { projectId: p1 }));
		bus.emit(ticketEvent("ticket.created", { projectId: p2 }));
		bus.emit(statusesChanged(p1));
		const b = bus.emit(ticketEvent("ticket.updated", { projectId: p1 }));
		bus.emit(prEvent("pr.updated"));
		const replay = bus.since(start.id, { types: ["ticket.*"], projectIds: [p1] });
		expect(replay).toEqual([a, b]);
	});
});
