import { describe, expect, test } from "bun:test";
import { StatusCategorySchema } from "@trellis/api";
import { applyStatusTransition } from "./statuses.ts";

// The two ticket timestamps follow the category of the status a ticket
// moves to. started_at is set once, on leaving todo, and never rewritten.
// completed_at is set on entering done or canceled and cleared on leaving
// them. Every status-to-status move is legal.

const now = new Date("2026-09-09T12:00:00.000Z");
const hourAgo = new Date(now.getTime() - 3_600_000);

const empty = { startedAt: null, completedAt: null };

describe("applyStatusTransition", () => {
	test("leaving todo sets started_at", () => {
		const result = applyStatusTransition({ ...empty, from: "todo", to: "started", now });
		expect(result).toEqual({ startedAt: now, completedAt: null });
	});

	test("started_at is set once and never rewritten", () => {
		const back = applyStatusTransition({ startedAt: hourAgo, completedAt: null, from: "started", to: "todo", now });
		expect(back.startedAt).toEqual(hourAgo);
		const again = applyStatusTransition({ ...back, from: "todo", to: "started", now });
		expect(again.startedAt).toEqual(hourAgo);
		expect(again.completedAt).toBeNull();
	});

	test("entering done or canceled sets completed_at", () => {
		const done = applyStatusTransition({ startedAt: hourAgo, completedAt: null, from: "started", to: "done", now });
		expect(done.completedAt).toEqual(now);
		const canceled = applyStatusTransition({
			startedAt: hourAgo,
			completedAt: null,
			from: "started",
			to: "canceled",
			now,
		});
		expect(canceled.completedAt).toEqual(now);
	});

	test("leaving done clears completed_at and keeps started_at", () => {
		const result = applyStatusTransition({ startedAt: hourAgo, completedAt: hourAgo, from: "done", to: "todo", now });
		expect(result).toEqual({ startedAt: hourAgo, completedAt: null });
	});

	test("a move from todo to done sets both timestamps", () => {
		const result = applyStatusTransition({ ...empty, from: "todo", to: "done", now });
		expect(result).toEqual({ startedAt: now, completedAt: now });
	});

	test("a move from done to canceled keeps the first completed_at", () => {
		const result = applyStatusTransition({
			startedAt: hourAgo,
			completedAt: hourAgo,
			from: "done",
			to: "canceled",
			now,
		});
		expect(result.completedAt).toEqual(hourAgo);
	});

	test("a move inside todo sets no timestamp", () => {
		const result = applyStatusTransition({ ...empty, from: "todo", to: "todo", now });
		expect(result).toEqual({ startedAt: null, completedAt: null });
	});

	test("every category pair is a legal move", () => {
		const categories = StatusCategorySchema.options;
		for (const from of categories) {
			for (const to of categories) {
				const result = applyStatusTransition({ ...empty, from, to, now });
				expect(result, `${from} -> ${to}`).toHaveProperty("startedAt");
				expect(result, `${from} -> ${to}`).toHaveProperty("completedAt");
			}
		}
	});
});
