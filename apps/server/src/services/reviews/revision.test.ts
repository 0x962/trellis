import { expect, test } from "bun:test";
import type { PrepareCtx } from "../support.ts";
import { comparisonFacts, headRepositoryOf, loadCurrentRevision, loadGitHubConversation } from "./revision.ts";

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

test("loads the GitHub conversation from comments, reviews and line comments", async () => {
	const gh = async (_queue: string, args: string[]) => {
		const endpoint = args.at(-1);
		if (endpoint?.includes("/issues/29/comments"))
			return {
				ok: true as const,
				stdout: JSON.stringify([
					[
						{
							id: 5,
							body: "Issue comment.",
							html_url: "https://github.com/acme/app/pull/29#issuecomment-5",
							created_at: "2026-09-21T10:00:00.000Z",
							updated_at: "2026-09-21T10:01:00.000Z",
							user: { login: "navid", avatar_url: "https://example.com/navid.png", type: "User" },
						},
					],
				]),
			};
		if (endpoint?.includes("/pulls/29/reviews"))
			return {
				ok: true as const,
				stdout: JSON.stringify([
					[
						{
							id: 6,
							body: "Review summary.",
							state: "APPROVED",
							html_url: "https://github.com/acme/app/pull/29#pullrequestreview-6",
							submitted_at: "2026-09-21T10:02:00.000Z",
							user: { login: "reviewer", avatar_url: null, type: "User" },
						},
					],
				]),
			};
		return {
			ok: true as const,
			stdout: JSON.stringify([
				[
					{
						id: 7,
						body: "Line comment.",
						path: "apps/web/src/App.tsx",
						line: 42,
						side: "RIGHT",
						html_url: "https://github.com/acme/app/pull/29#discussion_r7",
						created_at: "2026-09-21T10:03:00.000Z",
						updated_at: "2026-09-21T10:04:00.000Z",
						user: { login: "ci[bot]", avatar_url: "https://example.com/bot.png", type: "Bot" },
					},
				],
			]),
		};
	};
	const conversation = await loadGitHubConversation({ gh } as PrepareCtx, {
		owner: "acme",
		repo: "app",
		number: 29,
		url: "https://github.com/acme/app/pull/29",
	});

	expect(conversation.map((item) => item.id)).toEqual(["issue-comment:5", "review:6", "line-comment:7"]);
	expect(conversation[0]!.author).toEqual({ login: "navid", avatarUrl: "https://example.com/navid.png" });
	expect(conversation[1]!.state).toBe("APPROVED");
	expect(conversation[2]!).toMatchObject({
		path: "apps/web/src/App.tsx",
		line: 42,
		side: "new",
		isBot: true,
	});
});
