import { expect, test } from "bun:test";
import { evidenceFloor, type PrPathFacts } from "@trellis/api";
import { evidenceCheckResult } from "../evidence/check.ts";
import { pullRequestReadyText } from "./pullRequestReady.ts";

const risk: PrPathFacts["risk"] = {
	api: "no",
	cli: "no",
	background: "no",
	auth: "no",
	migration: "no",
	dependency: "no",
	sharedType: "no",
	deletedTest: "no",
};

const resultOf = (floor: ReturnType<typeof evidenceFloor>) =>
	evidenceCheckResult({
		pullRequest: { number: 131, url: "https://github.com/acme/trellis/pull/131", headSha: "abc123" },
		ticket: { identifier: "TRL-291", title: "Explain every pull request" },
		floor,
		present: floor.present.length,
		required: floor.required.length,
		verifyCommands: ["bun test"],
		checks: { pass: 3, fail: 0, pending: 0, skipped: 0, failedChecks: [] },
	});

test("names each missing item with its command when the summary is missing", () => {
	const result = resultOf(
		evidenceFloor({
			kind: "backend",
			risk,
			hasSummary: false,
			rows: [
				{ kind: "call", record: { status: 200 } },
				{ kind: "call", record: { status: 400 } },
			],
		}),
	);

	expect(
		pullRequestReadyText(result),
	).toBe(`#131 is not ready for review. A pull request requires the summary and every evidence floor item.
Run the command beside each MISSING line, then run: trellis ready 131

#131  TRL-291  Explain every pull request
kind: backend            needs the summary

  MISSING  summary        write the explanation, with images and diagrams:  trellis summary write 131 --headline "..." --why - --watch "..."
  present  working call
  present  failing call
  note     3 checks passed
`);
});

test("says the pull request is ready when every floor item is present", () => {
	const result = resultOf(
		evidenceFloor({
			kind: "backend",
			risk,
			hasSummary: true,
			rows: [
				{ kind: "call", record: { status: 200 } },
				{ kind: "call", record: { status: 400 } },
			],
		}),
	);

	expect(pullRequestReadyText(result).split("\n")[0]).toBe(
		"#131 is ready for review. It has the summary and every evidence floor item.",
	);
});
