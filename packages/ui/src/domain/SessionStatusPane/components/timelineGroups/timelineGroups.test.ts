import { expect, test } from "bun:test";
import type { SessionUpdate } from "../../types";
import { localDay, timelineGroups } from "./timelineGroups";

const update = (id: string, date: Date): SessionUpdate => ({
	id,
	createdAt: date.toISOString(),
	body: id,
	runId: "run",
	sessionId: null,
	requestId: null,
	embeds: [],
});

test("uses local midnight and orders equal timestamps by ID", () => {
	const now = new Date(2026, 8, 29, 0, 1);
	const beforeMidnight = update("old", new Date(2026, 8, 28, 23, 59));
	const first = update("b", new Date(2026, 8, 29, 0, 0));
	const second = { ...first, id: "a" };
	const groups = timelineGroups([second, beforeMidnight, first], now.toISOString());
	expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday"]);
	expect(groups[0]!.updates.map((row) => row.id)).toEqual(["b", "a"]);
	expect(groups[1]!.key).toBe(localDay(beforeMidnight.createdAt));
});
