import { describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import { ticketEvent } from "../../test/fixtures/events.ts";
import { createBus } from "./bus.ts";

// An entry carries the actor of the call that emitted it, so a subscriber
// in the database thread tells a person's change from an agent's. An event
// the poller emits carries no actor.

describe("bus actor", () => {
	test("an entry carries the actor its emit names, and null when it names none", () => {
		const bus = createBus({ bootId: ulid() });
		const seen: Array<{ type: string; actor: unknown }> = [];
		bus.subscribe((entry) => {
			seen.push({ type: entry.event.type, actor: entry.actor });
		});
		bus.emit(ticketEvent("ticket.updated"), { kind: "human", name: "dana" });
		bus.emit({ type: "pr.updated", id: ulid(), ticketIds: [ulid()], state: "open", ciState: "pass" });
		expect(seen).toEqual([
			{ type: "ticket.updated", actor: { kind: "human", name: "dana" } },
			{ type: "pr.updated", actor: null },
		]);
	});

	test("a replay from the ring keeps the actor", () => {
		const bus = createBus({ bootId: ulid() });
		const first = bus.emit(ticketEvent("ticket.created"), { kind: "agent", name: "builder-cde-1" });
		bus.emit(ticketEvent("ticket.updated"), { kind: "human", name: "dana" });
		const replay = bus.since(first.id)!;
		expect(replay.map((entry) => entry.actor)).toEqual([{ kind: "human", name: "dana" }]);
	});
});
