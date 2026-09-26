import { expect, test } from "bun:test";
import type { PullRequest } from "@trellis/api";
import { githubBody } from "./githubBody.ts";

const pullRequest = {
	repo: "trellis",
	additions: 186,
	deletions: 44,
	changedFiles: 7,
	files: [
		{ path: "apps/web/src/routes/index.tsx", change: "change", additions: 100, deletions: 20 },
		{ path: "packages/api/src/schemas/pullRequest.ts", change: "change", additions: 86, deletions: 24 },
	],
} satisfies Pick<PullRequest, "additions" | "changedFiles" | "deletions" | "files" | "repo">;

test("omits a local review URL from the GitHub body", () => {
	expect(
		githubBody(
			{ headline: "Give the Operator message post a timeout." },
			pullRequest,
			"http://127.0.0.1:4521/reviews/0x962/trellis/56930",
		),
	).toBe(`Give the Operator message post a timeout.
size +186 −44 · 7 files · band medium
risk auth no · migration no · dependency no · shared type yes · deleted test no
`);
});

test("prints an external review URL without credentials or a query", () => {
	const body = githubBody(
		{ headline: "Print it." },
		pullRequest,
		"https://trellis.example/reviews/0x962/trellis/56930",
	);

	expect(body).toContain("review https://trellis.example/reviews/0x962/trellis/56930\n");
	expect(githubBody({ headline: "Print it." }, pullRequest, "/Users/person/review")).not.toContain("review ");
	expect(githubBody({ headline: "Print it." }, pullRequest, "file:///tmp/review")).not.toContain("review ");
	expect(githubBody({ headline: "Print it." }, pullRequest, "https://127.0.0.2/review")).not.toContain("review ");
	expect(githubBody({ headline: "Print it." }, pullRequest, "https://[::1]/review")).not.toContain("review ");
	expect(githubBody({ headline: "Print it." }, pullRequest, "https://token@example.com/review")).not.toContain(
		"review ",
	);
	expect(githubBody({ headline: "Print it." }, pullRequest, "https://example.com/review?token=secret")).not.toContain(
		"review ",
	);
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
			files: [{ path: "packages/api/src/old.test.ts", change: "change", additions: 0, deletions: 10 }],
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
