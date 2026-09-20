import { expect, test } from "bun:test";
import { comparisonFacts } from "./revision.ts";

// The shape `gh api repos/<owner>/<repo>/compare/<base>...<head>` answered for
// canary-technologies-corp/canary#57080, cut to the fields the page reads.
const answer = (behindBy: number) =>
	JSON.stringify({
		status: "diverged",
		ahead_by: 2,
		behind_by: behindBy,
		total_commits: 2,
		merge_base_commit: { sha: "19cea5c42c50e4d407eb3dafb403fd10d176ab93" },
	});

test("reads the shared commit and how far the head is behind the base", () => {
	expect(comparisonFacts(answer(97))).toEqual({
		comparisonBaseSha: "19cea5c42c50e4d407eb3dafb403fd10d176ab93",
		behindBy: 97,
	});
});

test("a head that holds every commit of the base is zero commits behind", () => {
	expect(comparisonFacts(answer(0)).behindBy).toBe(0);
});
