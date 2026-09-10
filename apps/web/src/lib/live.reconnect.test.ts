import { describe, expect, spyOn, test } from "bun:test";
import { eventId, readyPayload, updatedPayload } from "../../test/fixtures";
import { createOrigin, startTab } from "../../test/liveHarness";

describe("lib/live reconnect", () => {
	// WS-51. The client closes a failed source and reopens it itself, so
	// the reopen carries the last id as `since` and the backoff is the
	// client's: 1, 2, 4, 8 s, then 8 s again.
	test("reconnect carries the last event id and backs off 1, 2, 4, 8 s capped", async () => {
		const origin = createOrigin();
		const tab = await startTab(origin);
		const first = tab.sources[0]!;
		first.emit("ready", eventId(4), readyPayload(4));
		first.emit("ticket.updated", eventId(7), updatedPayload(7));
		first.fail();
		expect(first.closed).toBe(true);
		expect(tab.sources).toHaveLength(1);
		origin.advanceTo(999);
		expect(tab.sources).toHaveLength(1);
		origin.advanceTo(1000);
		expect(tab.sources).toHaveLength(2);
		expect(tab.latest().url).toBe(`/api/events?since=${eventId(7)}`);
		const expectedOpenings = [1000, 3000, 7000, 15000, 23000];
		for (const [index, at] of expectedOpenings.entries()) {
			if (index > 0) {
				origin.advanceTo(at - 1);
				expect(tab.sources).toHaveLength(index + 1);
				origin.advanceTo(at);
				expect(tab.sources).toHaveLength(index + 2);
			}
			expect(tab.latest().openedAt).toBe(at);
			expect(tab.latest().url).toBe(`/api/events?since=${eventId(7)}`);
			tab.latest().fail();
			expect(tab.latest().closed).toBe(true);
		}
	});

	// WS-52. A reconnect may have missed events beyond the ring buffer, so
	// every query refetches once. The next failure starts the backoff over.
	test("a successful reconnect resets the backoff and invalidates every query", async () => {
		const origin = createOrigin();
		const tab = await startTab(origin);
		const invalidate = spyOn(tab.queryClient, "invalidateQueries");
		const first = tab.sources[0]!;
		first.emit("ready", eventId(4), readyPayload(4));
		expect(invalidate).not.toHaveBeenCalled();
		first.fail();
		origin.advanceTo(1000);
		tab.latest().fail();
		origin.advanceTo(3000);
		const reopened = tab.latest();
		reopened.emit("ready", eventId(4), readyPayload(4));
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(invalidate.mock.calls[0]![0]).toBeUndefined();
		expect(tab.live.status.get()).toBe("live");
		reopened.fail();
		origin.advanceTo(3999);
		expect(tab.sources).toHaveLength(3);
		origin.advanceTo(4000);
		expect(tab.sources).toHaveLength(4);
		expect(tab.latest().openedAt).toBe(4000);
	});
});
