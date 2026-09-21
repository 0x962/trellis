import { expect, test } from "bun:test";
import { currentVerdict, type VerdictFacts, verdictMark } from "./currentVerdict.ts";

const head = "b2c3d4e5";
const older = "a1b2c3d4";
const at = (minute: number) => `2026-09-21T10:${String(minute).padStart(2, "0")}:00.000Z`;
const submission = (facts: Partial<VerdictFacts>): VerdictFacts => ({
	verdict: "approved",
	headSha: head,
	byPerson: true,
	createdAt: at(0),
	...facts,
});

test("no submission gives no verdict", () => {
	expect(currentVerdict([], head)).toBeNull();
});

test("the latest verdict wins, whatever the order of the list", () => {
	const approval = submission({ verdict: "approved", createdAt: at(5) });
	const request = submission({ verdict: "changes_requested", createdAt: at(1) });

	expect(currentVerdict([request, approval], head)).toEqual({ submission: approval, stale: false });
	expect(currentVerdict([approval, request], head)).toEqual({ submission: approval, stale: false });
});

test("a verdict on an older head commit is stale", () => {
	const approval = submission({ headSha: older });

	expect(currentVerdict([approval], head)).toEqual({ submission: approval, stale: true });
});

test("a verdict that names no revision is stale", () => {
	const approval = submission({ headSha: null });

	expect(currentVerdict([approval], head)?.stale).toBe(true);
});

test("a comment does not count, even when it is newer", () => {
	const request = submission({ verdict: "changes_requested", createdAt: at(1) });
	const comment = submission({ verdict: "commented", createdAt: at(9) });

	expect(currentVerdict([comment, request], head)).toEqual({ submission: request, stale: false });
	expect(currentVerdict([comment], head)).toBeNull();
});

test("a verdict by an agent does not count", () => {
	const agentApproval = submission({ byPerson: false, createdAt: at(9) });
	const request = submission({ verdict: "changes_requested", createdAt: at(1) });

	expect(currentVerdict([agentApproval, request], head)?.submission).toBe(request);
	expect(currentVerdict([agentApproval], head)).toBeNull();
});

test("the mark shows a current verdict only", () => {
	expect(verdictMark([submission({ verdict: "changes_requested" })], head)).toBe("changes_requested");
	expect(verdictMark([submission({ headSha: older })], head)).toBeNull();
	expect(verdictMark([submission({ verdict: "commented" })], head)).toBeNull();
});
