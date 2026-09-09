import { expect, test } from "bun:test";
import { linkedPullRequest } from "../../test/fixtures.ts";
import { LinkedPullRequestSchema } from "./pullRequest.ts";

// The auto-link scan links a pull request as `system:trellis` with
// `source: "auto"`, so the linked row must parse with that actor.
test("a linked pull request accepts the auto-link actor system:trellis", () => {
	const auto = linkedPullRequest({ source: "auto", linkedBy: { name: "trellis", kind: "system" } });
	expect(LinkedPullRequestSchema.safeParse(auto).success).toBe(true);
	const manual = linkedPullRequest({ source: "manual", linkedBy: { name: "navid", kind: "human" } });
	expect(LinkedPullRequestSchema.safeParse(manual).success).toBe(true);
});
