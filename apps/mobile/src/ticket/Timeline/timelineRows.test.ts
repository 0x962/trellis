import { describe, expect, test } from "bun:test";
import { activityItem, ago, claude, commentItem, dana, day, hour, id, minute } from "../../../test/fixtures";
import { timelineRows } from "./timelineRows";

const now = Date.parse("2026-09-09T12:00:00.000Z");
const at = (ms: number) => ago(ms, now);

describe("timelineRows", () => {
	// O12. `timeline.list` answers newest first.
	test("orders the timeline oldest first", () => {
		const page = [
			commentItem({ id: id("C2"), createdAt: at(2 * hour) }),
			activityItem({ id: 2, field: "status", createdAt: at(day) }),
			commentItem({ id: id("C1"), createdAt: at(2 * day) }),
		];
		const rows = timelineRows(page);
		expect(rows.map((row) => row.kind)).toEqual(["comment", "activity", "comment"]);
		const [first, , last] = rows;
		expect(first?.kind === "comment" && first.comment.id).toBe(id("C1"));
		expect(last?.kind === "comment" && last.comment.id).toBe(id("C2"));
	});

	// O13. The priority row and the parent row of CDE-42, one minute apart.
	test("collapses activity by one actor inside five minutes into one row", () => {
		const page = [
			activityItem({
				id: 2,
				actor: claude,
				field: "parent",
				fromValue: null,
				toValue: "CDE-43",
				createdAt: at(3 * day),
			}),
			activityItem({
				id: 1,
				actor: claude,
				field: "priority",
				fromValue: "none",
				toValue: "high",
				createdAt: at(3 * day + minute),
			}),
		];
		const rows = timelineRows(page);
		expect(rows).toHaveLength(1);
		const row = rows[0]!;
		if (row.kind !== "activity") throw new Error("expected an activity row");
		expect(row.items.map((item) => item.id)).toEqual([1, 2]);
		expect(row.actor).toEqual(claude);
		expect(row.label).toContain("priority");
		expect(row.label).toContain("parent");
	});

	// O14. Three pairs of activity rows, each split another way.
	test("a comment, another actor, or a longer gap breaks a run", () => {
		const byComment = [
			activityItem({ id: 2, actor: claude, field: "priority", createdAt: at(hour) }),
			commentItem({ id: id("C1"), actor: claude, createdAt: at(hour + minute) }),
			activityItem({ id: 1, actor: claude, field: "status", createdAt: at(hour + 2 * minute) }),
		];
		const byActor = [
			activityItem({ id: 2, actor: dana, field: "priority", createdAt: at(hour) }),
			activityItem({ id: 1, actor: claude, field: "status", createdAt: at(hour + minute) }),
		];
		const byGap = [
			activityItem({ id: 2, actor: claude, field: "priority", createdAt: at(hour) }),
			activityItem({ id: 1, actor: claude, field: "status", createdAt: at(hour + 6 * minute) }),
		];
		for (const page of [byComment, byActor, byGap]) {
			const rows = timelineRows(page).filter((row) => row.kind === "activity");
			expect(rows).toHaveLength(2);
			for (const row of rows) expect(row.kind === "activity" && row.items).toHaveLength(1);
		}
	});
});
