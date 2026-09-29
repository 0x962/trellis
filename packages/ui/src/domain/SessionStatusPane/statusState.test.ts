import { expect, test } from "bun:test";
import { sessionStatusNotice, sessionUpdateAge } from "./statusState";
import type { SessionStatusProcessState } from "./types";

test.each([
	["2026-09-29T05:39:45.000Z", "Just now"],
	["2026-09-29T05:38:00.000Z", "2 min ago"],
	["2026-09-29T03:40:00.000Z", "2 hours ago"],
	["2026-09-27T05:40:00.000Z", "2 days ago"],
])("formats the update age from %s", (createdAt, label) => {
	expect(sessionUpdateAge(createdAt, "2026-09-29T05:40:00.000Z")).toBe(label);
});

test("uses the request time to decide whether an update is late", () => {
	expect(
		sessionStatusNotice({
			processState: "active",
			request: {
				requestId: "request-1",
				requestedAt: "2026-09-29T05:29:00.000Z",
				state: "sent",
				error: null,
			},
			latestAt: "2026-09-29T05:20:00.000Z",
			now: "2026-09-29T05:40:00.000Z",
			lateAfterMs: 10 * 60_000,
		}),
	).toBe("This update is 20 minutes old. Trellis is waiting for a new reply.");
});

test.each([
	["paused", null, null, "The session is paused. No agent update is available yet."],
	[
		"active",
		{ requestId: "request-1", requestedAt: "2026-09-29T05:35:00.000Z", state: "pending" as const, error: null },
		null,
		"An update was requested. The first agent reply will appear below.",
	],
	[
		"active",
		{ requestId: "request-1", requestedAt: "2026-09-29T05:29:00.000Z", state: "sent" as const, error: null },
		null,
		"The update request is 11 minutes old. Trellis is waiting for the first reply.",
	],
	[
		"active",
		{ requestId: "request-1", requestedAt: "2026-09-29T05:35:00.000Z", state: "failed" as const, error: "No reply" },
		null,
		"The status request failed. No agent reply is available yet; this does not mean the agent stopped.",
	],
])("describes the %s process before the first update", (processState, request, latestAt, notice) => {
	expect(
		sessionStatusNotice({
			processState: processState as SessionStatusProcessState,
			request,
			latestAt,
			now: "2026-09-29T05:40:00.000Z",
			lateAfterMs: 10 * 60_000,
		}),
	).toBe(notice);
});
