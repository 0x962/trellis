import { describe, expect, test } from "bun:test";
import { id, seededStatuses, status } from "../../../test/fixtures";
import { groupStatuses } from "./statusGroups";

describe("groupStatuses", () => {
	// O1. The effective set of CDE.web: the six seeded statuses, given out of order.
	test("groups the effective statuses by category in the fixed order", () => {
		const shuffled = [...seededStatuses()].reverse();
		const groups = groupStatuses(shuffled);
		expect(groups.map((group) => group.category)).toEqual(["todo", "started", "review", "done", "canceled"]);
		expect(groups.map((group) => group.statuses.map((entry) => entry.name))).toEqual([
			["Todo"],
			["In Progress"],
			["Agent Review", "Human Review"],
			["Done"],
			["Canceled"],
		]);
	});

	// O2. Two review statuses at 300 and 400, given newest first, and no canceled status.
	test("keeps the position order inside a group and drops an empty category", () => {
		const set = [
			status({ id: id("S4"), name: "Human Review", category: "review", reviewer: "human", position: 400 }),
			status({ id: id("S3"), name: "Agent Review", category: "review", reviewer: "agent", position: 300 }),
			status({ id: id("S1"), name: "Todo", category: "todo", position: 100 }),
			status({ id: id("S5"), name: "Done", category: "done", position: 500 }),
		];
		const groups = groupStatuses(set);
		const review = groups.find((group) => group.category === "review")!;
		expect(review.statuses.map((entry) => entry.position)).toEqual([300, 400]);
		expect(review.statuses.map((entry) => entry.name)).toEqual(["Agent Review", "Human Review"]);
		expect(groups.map((group) => group.category)).toEqual(["todo", "review", "done"]);
	});
});
