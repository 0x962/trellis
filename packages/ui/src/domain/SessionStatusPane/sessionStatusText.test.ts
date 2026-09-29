import { expect, test } from "bun:test";
import { sessionStatusNotice } from "./sessionStatusText";
import type { SessionStatusProcessState } from "./types";

test("does not treat age as an update failure", () => {
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
		}),
	).toBe("The observer prepares a new update. The last update stays below.");
});

test.each([
	["paused", null, null, "The session is paused. No observer update is available yet."],
	[
		"active",
		{ requestId: "request-1", requestedAt: "2026-09-29T05:35:00.000Z", state: "pending" as const, error: null },
		null,
		"The observer prepares the first update.",
	],
	[
		"active",
		{ requestId: "request-1", requestedAt: "2026-09-29T05:35:00.000Z", state: "failed" as const, error: "No reply" },
		null,
		"The observer update failed. No observer update is available yet.",
	],
])("describes the %s process before the first update", (processState, request, latestAt, notice) => {
	expect(
		sessionStatusNotice({
			processState: processState as SessionStatusProcessState,
			request,
			latestAt,
		}),
	).toBe(notice);
});
