import { expect, test } from "bun:test";
import { linkedPullRequest } from "../../test/fixtures.ts";
import { CheckSchema, LinkedPullRequestSchema } from "./pullRequest.ts";

// gh reports five check buckets. The snapshot keeps `cancel` and `skipping`
// verbatim; only `ciState` folds them. `none` is an aggregate state, never a
// check's own bucket.
test("a check keeps gh's cancel and skipping buckets verbatim", () => {
	const check = (bucket: string) => CheckSchema.safeParse({ name: "build", workflow: "ci", bucket, link: null });
	for (const bucket of ["pass", "fail", "pending", "skipping", "cancel"]) {
		expect(check(bucket).success, bucket).toBe(true);
	}
	expect(check("none").success).toBe(false);
});

// The auto-link scan links a pull request as `system:trellis` with
// `source: "auto"`, so the linked row must parse with that actor.
test("a linked pull request accepts the auto-link actor system:trellis", () => {
	const auto = linkedPullRequest({ source: "auto", linkedBy: { name: "trellis", kind: "system" } });
	expect(LinkedPullRequestSchema.safeParse(auto).success).toBe(true);
	const manual = linkedPullRequest({ source: "manual", linkedBy: { name: "navid", kind: "human" } });
	expect(LinkedPullRequestSchema.safeParse(manual).success).toBe(true);
});
