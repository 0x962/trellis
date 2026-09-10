import { describe, expect, spyOn, test } from "bun:test";
import { generateOperationKey } from "@orpc/tanstack-query";
import { eventId, readyPayload, ticket, updatedPayload } from "../../test/fixtures";
import { createOrigin, flush, recordingApplier, startTab } from "../../test/liveHarness";

const detailKey = generateOperationKey(["tickets", "get"], { input: { ticket: "CDE-42" }, type: "query" });

describe("lib/live leader election", () => {
	// WS-48. One EventSource per origin: the tab that holds the trellis-sse
	// lock owns the connection, every other tab waits on the lock.
	test("one tab per origin wins the trellis-sse lock and owns the EventSource", async () => {
		const origin = createOrigin();
		const first = await startTab(origin);
		const second = await startTab(origin);
		expect(first.sources).toHaveLength(1);
		expect(second.sources).toHaveLength(0);
		expect(first.sources[0]!.url).toBe("/api/events");
		expect(origin.locks.isHeld("trellis-sse")).toBe(true);
		expect(first.live.isLeader()).toBe(true);
		expect(second.live.isLeader()).toBe(false);
	});

	// WS-49. The leader parses each frame once and rebroadcasts the parsed
	// event. Every tab, the leader included, feeds applyEvent exactly once.
	test("every tab feeds applyEvent once per event", async () => {
		const origin = createOrigin();
		const leaderApplier = recordingApplier();
		const followerApplier = recordingApplier();
		const leader = await startTab(origin, { applyEvent: leaderApplier });
		const follower = await startTab(origin, { applyEvent: followerApplier });
		const source = leader.sources[0]!;
		source.emit("ready", eventId(4), readyPayload(4));
		const payload = updatedPayload(5);
		source.emit("ticket.updated", eventId(5), payload);
		const expected = { type: "ticket.updated", ...payload };
		expect(leaderApplier).toHaveBeenCalledTimes(1);
		expect(leaderApplier.mock.calls[0]![0]).toEqual(expected);
		expect(leaderApplier.mock.calls[0]![1]).toBe(leader.queryClient);
		expect(followerApplier).toHaveBeenCalledTimes(1);
		expect(followerApplier.mock.calls[0]![0]).toEqual(expected);
		expect(followerApplier.mock.calls[0]![1]).toBe(follower.queryClient);
		const posted = origin.bus.channels.values().next().value!.posted;
		expect(posted).toContainEqual({ id: eventId(5), type: "ticket.updated", data: payload });
		expect(leader.live.lastId()).toBe(eventId(5));
		expect(follower.live.lastId()).toBe(eventId(5));
	});

	test("the default applier is applyEvent from @trellis/api and patches the query cache", async () => {
		const origin = createOrigin();
		const leader = await startTab(origin);
		const follower = await startTab(origin);
		for (const tab of [leader, follower]) tab.queryClient.setQueryData(detailKey, ticket({ version: 4 }));
		const leaderSet = spyOn(leader.queryClient, "setQueryData");
		const followerSet = spyOn(follower.queryClient, "setQueryData");
		const source = leader.sources[0]!;
		source.emit("ready", eventId(4), readyPayload(4));
		source.emit("ticket.updated", eventId(5), updatedPayload(5));
		for (const [tab, spy] of [
			[leader, leaderSet],
			[follower, followerSet],
		] as const) {
			expect(spy).toHaveBeenCalledTimes(1);
			expect((tab.queryClient.getQueryData(detailKey) as { version: number }).version).toBe(5);
		}
	});

	// WS-50. A closed leader tab releases the lock. The next tab in line
	// opens its own EventSource from the last id it saw over the channel.
	test("the follower takes over the lock and resumes from the last id", async () => {
		const origin = createOrigin();
		const leader = await startTab(origin);
		const follower = await startTab(origin);
		const source = leader.sources[0]!;
		source.emit("ready", eventId(4), readyPayload(4));
		source.emit("ticket.updated", eventId(5), updatedPayload(5));
		await leader.live.stop();
		await flush();
		expect(source.closed).toBe(true);
		expect(follower.sources).toHaveLength(1);
		expect(follower.sources[0]!.url).toBe(`/api/events?since=${eventId(5)}`);
		expect(follower.live.isLeader()).toBe(true);
		expect(leader.sources.length + follower.sources.length).toBe(2);
	});
});
