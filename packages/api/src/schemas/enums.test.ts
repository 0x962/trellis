import { expect, test } from "bun:test";
import {
	ActorKindSchema,
	CheckBucketSchema,
	CiStateSchema,
	PrioritySchema,
	PrStateSchema,
	ReviewerSchema,
	ReviewStateSchema,
	StatusCategorySchema,
} from "./enums.ts";

// Order matters: the web sorts priorities and status groups by option index.
test("every enum lists exactly the plan's closed set", () => {
	expect(PrioritySchema.options).toEqual(["none", "urgent", "high", "medium", "low"]);
	expect(StatusCategorySchema.options).toEqual(["todo", "started", "review", "done", "canceled"]);
	expect(ReviewerSchema.options).toEqual(["human", "agent"]);
	expect(ActorKindSchema.options).toEqual(["human", "agent"]);
	expect(PrStateSchema.options).toEqual(["open", "closed", "merged"]);
	expect(CiStateSchema.options).toEqual(["none", "pending", "pass", "fail"]);
	expect(CheckBucketSchema.options).toEqual(["pass", "fail", "pending", "skipping", "cancel"]);
	expect(ReviewStateSchema.options).toEqual(["none", "review_required", "approved", "changes_requested"]);
});
