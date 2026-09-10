import { describe, expect, spyOn, test } from "bun:test";
import { generateOperationKey } from "@orpc/tanstack-query";
import { bootId, eventId, otherBootId, readyPayload, ticket, updatedPayload } from "../../test/fixtures";
import { createOrigin, recordingApplier, startTab } from "../../test/liveHarness";

const detailKey = generateOperationKey(["tickets", "get"], { input: { ticket: "CDE-42" }, type: "query" });

describe("lib/live events", () => {
	// WS-58. A reset says the id the client resumed from is gone, so every
	// query refetches. The applier never sees the control frame.
	test("reset invalidates all", async () => {
		const origin = createOrigin();
		const applyEvent = recordingApplier();
		const tab = await startTab(origin, { applyEvent });
		tab.queryClient.setQueryData(detailKey, ticket());
		const invalidate = spyOn(tab.queryClient, "invalidateQueries");
		tab.sources[0]!.emit("ready", eventId(2), readyPayload(2));
		expect(invalidate).not.toHaveBeenCalled();
		tab.sources[0]!.emit("reset", eventId(2), { reason: "restart" });
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(invalidate.mock.calls[0]![0]).toBeUndefined();
		expect(applyEvent).not.toHaveBeenCalled();
	});

	// WS-59. The boot id is the server generation. A ready from another
	// boot means every cached row may be stale.
	test("ready records the boot id and a new boot invalidates all", async () => {
		const origin = createOrigin();
		const applyEvent = recordingApplier();
		const tab = await startTab(origin, { applyEvent });
		const invalidate = spyOn(tab.queryClient, "invalidateQueries");
		const first = tab.sources[0]!;
		first.emit("ready", eventId(3), readyPayload(3));
		expect(tab.live.bootId()).toBe(bootId);
		expect(tab.live.lastId()).toBe(eventId(3));
		expect(invalidate).not.toHaveBeenCalled();
		first.emit("ticket.updated", eventId(4), updatedPayload(4));
		expect(tab.live.lastId()).toBe(eventId(4));
		first.fail();
		origin.advanceTo(1000);
		tab.latest().emit("ready", eventId(0, otherBootId), readyPayload(0, otherBootId));
		expect(tab.live.bootId()).toBe(otherBootId);
		expect(tab.live.lastId()).toBe(eventId(0, otherBootId));
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(applyEvent).toHaveBeenCalledTimes(1);
	});

	// WS-60. A frame the server wrote is valid JSON. Anything else is a
	// bug, and a bug crashes where it happens.
	test("a malformed event crashes at the parse point", async () => {
		const origin = createOrigin();
		const applyEvent = recordingApplier();
		const tab = await startTab(origin, { applyEvent });
		const source = tab.sources[0]!;
		source.emit("ready", eventId(1), readyPayload(1));
		expect(() => source.emitRaw("ticket.created", eventId(2), "{not json")).toThrow(SyntaxError);
		expect(applyEvent).not.toHaveBeenCalled();
	});
});
