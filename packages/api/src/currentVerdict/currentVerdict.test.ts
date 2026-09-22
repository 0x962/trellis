import { expect, test } from "bun:test";
import { currentVerdict, type VerdictFacts, verdictMark } from "./currentVerdict.ts";

const at = (minute: number) => `2026-09-21T10:${String(minute).padStart(2, "0")}:00.000Z`;
const submission = (facts: Partial<VerdictFacts>): VerdictFacts => ({
	verdict: "approved",
	byPerson: true,
	createdAt: at(0),
	...facts,
});

test("no submission gives no verdict", () => {
	expect(currentVerdict([])).toBeNull();
});

test("the latest verdict wins, whatever the order of the list", () => {
	const approval = submission({ verdict: "approved", createdAt: at(5) });
	const request = submission({ verdict: "changes_requested", createdAt: at(1) });

	expect(currentVerdict([request, approval])).toBe(approval);
	expect(currentVerdict([approval, request])).toBe(approval);
});

test("a comment does not count, even when it is newer", () => {
	const request = submission({ verdict: "changes_requested", createdAt: at(1) });
	const comment = submission({ verdict: "commented", createdAt: at(9) });

	expect(currentVerdict([comment, request])).toBe(request);
	expect(currentVerdict([comment])).toBeNull();
});

test("a verdict by an agent does not count", () => {
	const agentApproval = submission({ byPerson: false, createdAt: at(9) });
	const request = submission({ verdict: "changes_requested", createdAt: at(1) });

	expect(currentVerdict([agentApproval, request])).toBe(request);
	expect(currentVerdict([agentApproval])).toBeNull();
});

test("the mark shows the latest verdict by the person", () => {
	expect(verdictMark([submission({ verdict: "changes_requested" })])).toBe("changes_requested");
	expect(verdictMark([submission({ verdict: "commented" })])).toBeNull();
});
