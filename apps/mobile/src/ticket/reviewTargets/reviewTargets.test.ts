import { describe, expect, test } from "bun:test";
import { id, status } from "../../../test/fixtures";
import { approveTarget, sendBackTarget, showsReviewActions } from "./reviewTargets";

describe("review targets", () => {
	// O3. Two done statuses, the higher position first.
	test("approveTarget picks the done status with the lowest position", () => {
		const set = [
			status({ id: id("S6"), name: "Shipped", slug: "shipped", category: "done", position: 600 }),
			status({ id: id("S5"), name: "Done", slug: "done", category: "done", position: 500 }),
			status({ id: id("S2"), name: "In Progress", category: "started", position: 200 }),
		];
		const target = approveTarget(set);
		expect(target.position).toBe(500);
		expect(target.name).toBe("Done");
	});

	// O4. One started status and one done status.
	test("sendBackTarget picks the started status with the lowest position", () => {
		const set = [
			status({ id: id("S5"), name: "Done", slug: "done", category: "done", position: 500 }),
			status({ id: id("S2"), name: "In Progress", category: "started", position: 200 }),
		];
		const target = sendBackTarget(set);
		expect(target.category).toBe("started");
		expect(target.name).toBe("In Progress");
	});

	// O5. A human reviewer, an agent reviewer, and a started status.
	test("the review actions show only on a human reviewer status", () => {
		expect(showsReviewActions({ category: "review", reviewer: "human" })).toBe(true);
		expect(showsReviewActions({ category: "review", reviewer: "agent" })).toBe(false);
		expect(showsReviewActions({ category: "started", reviewer: null })).toBe(false);
	});
});
