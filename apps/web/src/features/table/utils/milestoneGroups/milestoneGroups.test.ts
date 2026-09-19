import { describe, expect, test } from "bun:test";
import type { MilestoneSummary } from "@trellis/api";
import { doneMilestoneIds, milestoneMarks } from "./milestoneGroups";

const milestone = (id: string, state: "open" | "done", done: number, total: number, canceled = 0) =>
	({ id, state, counts: { done, total, canceled } }) as MilestoneSummary;

const foundation = milestone("foundation", "done", 4, 5, 1);
const surfaces = milestone("surfaces", "open", 1, 3);
const integrate = milestone("integrate", "open", 0, 2);
const fix = milestone("fix", "done", 1, 1);
const milestones = [foundation, surfaces, integrate, fix];

describe("milestoneMarks", () => {
	test("marks the current milestone, and each open milestone after it as Later", () => {
		const marks = milestoneMarks(milestones, surfaces.id);

		expect(marks.get(foundation.id)).toEqual({ countLabel: "4/4" });
		expect(marks.get(surfaces.id)).toEqual({ countLabel: "1/3", badge: "Current" });
		expect(marks.get(integrate.id)).toEqual({ countLabel: "0/2", note: "Later" });
		expect(marks.get(fix.id)).toEqual({ countLabel: "1/1" });
	});

	test("prints the counts alone when no milestone is current", () => {
		const marks = milestoneMarks([foundation, fix], undefined);

		expect([...marks.values()]).toEqual([{ countLabel: "4/4" }, { countLabel: "1/1" }]);
	});
});

describe("doneMilestoneIds", () => {
	test("names the done milestones, which start collapsed", () => {
		expect(doneMilestoneIds(milestones)).toEqual([foundation.id, fix.id]);
	});
});
