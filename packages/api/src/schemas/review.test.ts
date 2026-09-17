import { describe, expect, test } from "bun:test";
import { ReviewSubmitSchema } from "./review";

describe("ReviewSubmitSchema", () => {
	test("accepts the three GitHub review choices", () => {
		for (const verdict of ["comment", "approve", "request_changes"] as const) {
			const body = verdict === "approve" ? "" : "Review summary";
			expect(ReviewSubmitSchema.parse({ pr: "owner/repo#12", headSha: "abc123", verdict, body })).toEqual({
				pr: "owner/repo#12",
				headSha: "abc123",
				verdict,
				body,
			});
		}
	});

	test("requires a summary for a comment or a change request", () => {
		for (const verdict of ["comment", "request_changes"] as const) {
			expect(ReviewSubmitSchema.safeParse({ pr: "owner/repo#12", headSha: "abc123", verdict, body: "" }).success).toBe(
				false,
			);
		}
	});

	test("rejects local notification fields", () => {
		expect(
			ReviewSubmitSchema.safeParse({
				pr: "owner/repo#12",
				headSha: "abc123",
				verdict: "approve",
				body: "",
				recipients: ["agent-run"],
			}).success,
		).toBe(false);
	});
});
