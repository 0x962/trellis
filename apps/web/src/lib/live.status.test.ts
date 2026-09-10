import { describe, expect, test } from "bun:test";
import { eventId, readyPayload, updatedPayload } from "../../test/fixtures";
import { createOrigin, startTab } from "../../test/liveHarness";
import { createStatusStore } from "./live";

describe("lib/live status", () => {
	test("createStatusStore starts at the given value and notifies on change", () => {
		const store = createStatusStore("connecting");
		const seen: string[] = [];
		const unsubscribe = store.subscribe(() => seen.push(store.get()));
		store.set("live");
		store.set("live");
		expect(store.get()).toBe("live");
		expect(seen).toEqual(["live"]);
		unsubscribe();
		store.set("down");
		expect(seen).toEqual(["live"]);
	});

	// WS-53
	test("status is live after ready", async () => {
		const origin = createOrigin();
		const tab = await startTab(origin);
		expect(tab.live.status.get()).toBe("connecting");
		tab.sources[0]!.open();
		expect(tab.live.status.get()).toBe("connecting");
		tab.sources[0]!.emit("ready", eventId(1), readyPayload(1));
		expect(tab.live.status.get()).toBe("live");
	});

	// WS-54. A short blip never shows a banner: the status turns to
	// reconnecting only after 3 s without a connection.
	test("reconnecting shows only after 3 s without a connection", async () => {
		const origin = createOrigin();
		const tab = await startTab(origin);
		tab.sources[0]!.emit("ready", eventId(1), readyPayload(1));
		tab.sources[0]!.fail();
		origin.advanceTo(1000);
		tab.latest().fail();
		origin.advanceTo(2900);
		expect(tab.live.status.get()).toBe("live");
		origin.advanceTo(3000);
		expect(tab.live.status.get()).toBe("reconnecting");
	});

	// WS-55. `bye` means the server is going down on purpose, so the
	// status says so at once and the reconnect loop starts at 1 s.
	test("bye sets restarting at once and starts the reconnect loop", async () => {
		const origin = createOrigin();
		const tab = await startTab(origin);
		const source = tab.sources[0]!;
		source.emit("ready", eventId(1), readyPayload(1));
		source.emit("ticket.updated", eventId(2), updatedPayload(5));
		source.emit("bye", eventId(3), { reason: "shutdown" });
		expect(tab.live.status.get()).toBe("restarting");
		expect(source.closed).toBe(true);
		origin.advanceTo(999);
		expect(tab.sources).toHaveLength(1);
		origin.advanceTo(1000);
		expect(tab.sources).toHaveLength(2);
		expect(tab.latest().url).toBe(`/api/events?since=${eventId(3)}`);
		tab.latest().emit("ready", eventId(0, "01J8Z6X4Q3M2K1H0G9F8E7D6B1"), readyPayload(0, "01J8Z6X4Q3M2K1H0G9F8E7D6B1"));
		expect(tab.live.status.get()).toBe("live");
	});

	// WS-56. Four failed reopens take about 15 s. After that the server is
	// down as far as the shell knows, until a ready arrives.
	test("down after four failed reconnects, live again on ready", async () => {
		const origin = createOrigin();
		const tab = await startTab(origin);
		tab.sources[0]!.emit("ready", eventId(1), readyPayload(1));
		tab.sources[0]!.fail();
		for (const at of [1000, 3000, 7000]) {
			origin.advanceTo(at);
			tab.latest().fail();
		}
		expect(tab.live.status.get()).toBe("reconnecting");
		origin.advanceTo(15000);
		tab.latest().fail();
		expect(tab.live.status.get()).toBe("down");
		origin.advanceTo(23000);
		tab.latest().emit("ready", eventId(1), readyPayload(1));
		expect(tab.live.status.get()).toBe("live");
	});

	// WS-57. A follower has no connection of its own, so its dot and banner
	// mirror the leader's status through the channel.
	test("followers mirror the leader's status", async () => {
		const origin = createOrigin();
		const leader = await startTab(origin);
		const follower = await startTab(origin);
		expect(follower.live.status.get()).toBe("connecting");
		leader.sources[0]!.emit("ready", eventId(1), readyPayload(1));
		expect(follower.live.status.get()).toBe("live");
		const posted = origin.bus.channels.values().next().value!.posted;
		expect(posted).toContainEqual({ type: "status", value: "live" });
		leader.sources[0]!.emit("bye", eventId(2), { reason: "shutdown" });
		expect(follower.live.status.get()).toBe("restarting");
		origin.advanceTo(1000);
		leader.latest().fail();
		origin.advanceTo(3000);
		leader.latest().fail();
		origin.advanceTo(7000);
		expect(leader.live.status.get()).toBe("reconnecting");
		expect(follower.live.status.get()).toBe("reconnecting");
	});
});
