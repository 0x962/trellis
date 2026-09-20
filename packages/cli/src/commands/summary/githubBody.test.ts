import { expect, test } from "bun:test";
import type { PullRequest } from "@trellis/api";
import { githubBody } from "./githubBody.ts";

const pullRequest = {
	repo: "trellis",
	additions: 186,
	deletions: 44,
	changedFiles: 7,
	files: [
		{ path: "apps/web/src/routes/index.tsx", additions: 100, deletions: 20 },
		{ path: "packages/api/src/schemas/pullRequest.ts", additions: 86, deletions: 24 },
	],
} satisfies Pick<PullRequest, "additions" | "changedFiles" | "deletions" | "files" | "repo">;

test("prints the four-line GitHub body from stored pull request facts", () => {
	expect(
		githubBody(
			{ headline: "Give the Operator message post a timeout." },
			pullRequest,
			"http://127.0.0.1:4521/reviews/0x962/trellis/56930",
		),
	).toBe(`Give the Operator message post a timeout.
size +186 −44 · 7 files · band medium
risk auth no · migration no · dependency no · shared type yes · deleted test no
review http://127.0.0.1:4521/reviews/0x962/trellis/56930
`);
});

test("uses the stored line count for each size band", () => {
	expect(githubBody({ headline: "Print it." }, { ...pullRequest, additions: 155, deletions: 44 }, "review")).toContain(
		"band small",
	);
	expect(githubBody({ headline: "Print it." }, { ...pullRequest, additions: 356, deletions: 44 }, "review")).toContain(
		"band medium",
	);
	expect(githubBody({ headline: "Print it." }, { ...pullRequest, additions: 357, deletions: 44 }, "review")).toContain(
		"band large",
	);
});

test("reads a deleted test risk from the stored file counts", () => {
	const body = githubBody(
		{ headline: "Print it." },
		{
			...pullRequest,
			files: [{ path: "packages/api/src/old.test.ts", additions: 0, deletions: 10 }],
		},
		"review",
	);
	expect(body).toContain("deleted test yes");
});

test("refuses to print missing stored diff counts", () => {
	expect(() => githubBody({ headline: "Print it." }, { ...pullRequest, additions: null }, "review")).toThrow(
		"pull request trellis has no diff counts yet",
	);
});
