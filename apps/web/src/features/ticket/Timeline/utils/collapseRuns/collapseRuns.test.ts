import { describe, expect, test } from "bun:test";
import type { TimelineItem } from "@trellis/api";
import { batchId, projectId, ticketId } from "../../../../../../test/fixtures";
import { collapseRuns } from "./collapseRuns";

type Actor = { name: string; kind: "agent" | "human" };

const claude: Actor = { name: "claude-code", kind: "agent" };
const dana: Actor = { name: "dana", kind: "human" };

// `at` is a clock time on one day; the rows are oldest first.
const at = (clock: string) => `2026-09-09T${clock}:00.000Z`;

let nextId = 1;

const activity = (actor: Actor, clock: string, field = "status"): TimelineItem => ({
	kind: "activity",
	id: nextId++,
	batchId,
	rootId: projectId,
	projectId,
	ticketId,
	actor,
	action: "ticket.updated",
	field,
	fromValue: "Todo",
	toValue: "In Progress",
	meta: {},
	createdAt: at(clock),
});

const comment = (actor: Actor, clock: string): Extract<TimelineItem, { kind: "comment" }> => ({
	kind: "comment",
	parentId: null,
	resolvedAt: null,
	id: `01J8Z6X4Q3M2K1H0G9F8E7D6${String(nextId++).padStart(2, "0")}`,
	ticketId,
	body: "Plan.",
	actor,
	createdAt: at(clock),
	updatedAt: at(clock),
});

const sizes = (entries: ReturnType<typeof collapseRuns>) =>
	entries.map((entry) => (entry.kind === "activity" ? entry.items.length : 1));

describe("features/ticket/Timeline/utils/collapseRuns", () => {
	// WT-81. Five minutes is the window, and the actor must match.
	test("a 5 minute gap or a new actor ends a run", () => {
		const gap = collapseRuns([activity(claude, "22:08"), activity(claude, "22:14", "priority")]);
		expect(sizes(gap)).toEqual([1, 1]);
		const other = collapseRuns([activity(claude, "22:08"), activity(dana, "22:09", "priority")]);
		expect(sizes(other)).toEqual([1, 1]);
		const inside = collapseRuns([activity(claude, "22:08"), activity(claude, "22:12", "priority")]);
		expect(sizes(inside)).toEqual([2]);
	});

	// WT-82. A comment is its own entry and splits the activity around it.
	test("a comment breaks an activity run", () => {
		const middle = comment(claude, "22:09");
		const entries = collapseRuns([activity(claude, "22:08"), middle, activity(claude, "22:10", "priority")]);
		expect(entries.map((entry) => entry.kind)).toEqual(["activity", "comment", "activity"]);
		expect(sizes(entries)).toEqual([1, 1, 1]);
		expect(entries[1]!.kind === "comment" && entries[1]!.item.id).toBe(middle.id);
	});
});
