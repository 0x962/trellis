import { expect, test } from "bun:test";
import type { PrepareCtx } from "../support.ts";
import { comparisonFacts, headRepositoryOf, loadCurrentRevision } from "./revision.ts";

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

test("loads the revision again when the head changes during the first diff", async () => {
	let metadataReads = 0;
	const gh = async (_queue: string, args: string[]) => {
		if (args[0] === "pr" && args[1] === "view" && args.at(-1) !== "headRefOid,baseRefOid") {
			metadataReads += 1;
			const suffix = metadataReads === 1 ? "old" : "new";
			return {
				ok: true as const,
				stdout: JSON.stringify({ headRefOid: `head-${suffix}`, baseRefOid: `base-${suffix}` }),
			};
		}
		if (args[0] === "api") return { ok: true as const, stdout: answer(0) };
		if (args[0] === "pr" && args[1] === "diff") return { ok: true as const, stdout: `patch-${metadataReads}` };
		return {
			ok: true as const,
			stdout: JSON.stringify({ headRefOid: "head-new", baseRefOid: "base-new" }),
		};
	};
	const loaded = await loadCurrentRevision({ gh } as PrepareCtx, {
		owner: "acme",
		repo: "app",
		number: 29,
		url: "https://github.com/acme/app/pull/29",
	});
	expect(metadataReads).toBe(2);
	expect(loaded.meta.headRefOid).toBe("head-new");
	expect(loaded.patch).toBe("patch-2");
});

// `gh pr view --json headRepository` answers this shape for a branch of the
// pull request repository itself.
test("an empty repository name reads the owner and the name beside it", () => {
	expect(
		headRepositoryOf(
			{ owner: "acme", repo: "app" },
			{ headRepository: { name: "app", nameWithOwner: "" }, headRepositoryOwner: { login: "acme" } },
		),
	).toBe("acme/app");
});

test("a fork names its repository in full", () => {
	expect(
		headRepositoryOf(
			{ owner: "acme", repo: "app" },
			{ headRepository: { nameWithOwner: "contributor/app" }, headRepositoryOwner: { login: "contributor" } },
		),
	).toBe("contributor/app");
});
