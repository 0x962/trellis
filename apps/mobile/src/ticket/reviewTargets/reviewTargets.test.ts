import { describe, expect, test } from "bun:test";
import { id, status } from "../../../test/fixtures";
import { approveTarget, sendBackTarget, showsReviewActions } from "./reviewTargets";

describe("review targets", () => {
	// TRL-15. The TRL set: Deploy Queue sits between Human Review and Done.
	const humanReview = status({
		id: id("S3"),
		name: "Human Review",
		slug: "human-review",
		category: "review",
		reviewer: "human",
		position: 3,
	});
	const deployQueue = status({
		id: id("S4"),
		name: "Deploy Queue",
		slug: "deploy-queue",
		category: "review",
		reviewer: "agent",
		position: 4,
	});
	const done = status({ id: id("S5"), name: "Done", slug: "done", category: "done", position: 5 });
	const shipped = status({ id: id("S6"), name: "Shipped", slug: "shipped", category: "done", position: 6 });
	const canceled = status({ id: id("S7"), name: "Canceled", slug: "canceled", category: "canceled", position: 7 });

	test("approveTarget picks the status after the current one, not a done status", () => {
		const target = approveTarget([canceled, shipped, done, deployQueue, humanReview], humanReview);
		expect(target.name).toBe("Deploy Queue");
	});

	// O3. No status sits between Human Review and the two done statuses.
	test("approveTarget picks the lowest done status when it follows the review status", () => {
		expect(approveTarget([shipped, done, humanReview, canceled], humanReview).name).toBe("Done");
	});

	// A status created later takes the last position, after Canceled. Column
	// order still puts it with the review statuses, before Done.
	test("approveTarget follows the column order, category first and then position", () => {
		const appended = { ...deployQueue, position: 9 };
		expect(approveTarget([done, appended, humanReview, canceled], humanReview).name).toBe("Deploy Queue");
	});

	test("approveTarget never picks a canceled status", () => {
		const early = { ...canceled, position: 4 };
		expect(approveTarget([early, humanReview, done], humanReview).name).toBe("Done");
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
