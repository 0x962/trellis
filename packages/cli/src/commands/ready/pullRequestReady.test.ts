import { expect, test } from "bun:test";
import { type PullRequestReadiness, pullRequestDraftText, pullRequestReadyText } from "./pullRequestReady.ts";

const readiness = (missing: PullRequestReadiness["missing"]): PullRequestReadiness => ({
	pullRequest: { number: 131, url: "https://github.com/acme/trellis/pull/131", headSha: "abc123" },
	missing,
	ready: missing.length === 0,
});

test("names each missing part with its command", () => {
	expect(pullRequestReadyText(readiness(["explanation", "evidence"]))).toBe(
		`#131 is not ready for review. Write each missing part, then run: trellis ready 131
  MISSING  explanation  trellis summary write 131 --headline "..." --why - --watch "..."
  MISSING  evidence     trellis evidence write 131 --body -
`,
	);
});

test("names only the evidence document when the explanation exists", () => {
	expect(pullRequestReadyText(readiness(["evidence"]))).toBe(
		`#131 is not ready for review. Write each missing part, then run: trellis ready 131
  MISSING  evidence     trellis evidence write 131 --body -
`,
	);
});

test("says the pull request is ready when both parts exist", () => {
	expect(pullRequestReadyText(readiness([]))).toBe(
		"#131 is ready for review. It has the explanation and the evidence document. The person will now review it.\n",
	);
});

test("tells the agent that a linked pull request is a draft until trellis ready", () => {
	expect(pullRequestDraftText(131)).toBe(
		"#131 is a draft. When the work is complete and you want the person to review it, run: trellis ready 131\n",
	);
});
