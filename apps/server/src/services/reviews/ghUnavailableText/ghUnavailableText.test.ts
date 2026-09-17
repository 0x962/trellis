import { describe, expect, it } from "bun:test";
import { ghUnavailableText } from "./ghUnavailableText";

describe("ghUnavailableText", () => {
	it("returns the GitHub error without command prefixes", () => {
		expect(
			ghUnavailableText(
				"failed to create review: GraphQL: Review Can not approve your own pull request (addPullRequestReview)",
			),
		).toBe("Review Can not approve your own pull request (addPullRequestReview)");
	});
});
