import { expect, test } from "bun:test";
import type { Evidence, EvidenceKind } from "@trellis/api";
import { evidenceText } from "./evidenceText.ts";

const evidence = (kind: EvidenceKind, headSha: string, record: Evidence["record"], filename?: string): Evidence =>
	({
		id: `${kind}-id`,
		pullRequestId: "pull-request-id",
		headSha,
		kind,
		record,
		blob: filename === undefined ? null : { filename },
		actor: { kind: "agent", name: "test" },
		createdAt: "2026-09-20T20:32:08.114Z",
	}) as Evidence;

test("prints each evidence kind with its head, file, and caption", () => {
	const rows = [
		evidence("after", "new-head", { route: "/reviews/170" }, "after.png"),
		evidence("before", "old-head", { route: "/reviews/170" }, "before.png"),
		evidence("capture", "new-head", { route: "/reviews/170" }),
		evidence("clip", "new-head", { caption: "The dialog releases." }, "proof.mp4"),
		evidence("console", "new-head", {}, "console.txt"),
		evidence("verify", "new-head", { command: "bun scripts/check.ts" }),
		evidence("test", "new-head", { name: "lists the old head" }),
		evidence("test", "new-head", { none: true, reason: "The change deletes code only." }),
		evidence("contract", "new-head", { none: true }),
		evidence("migration", "new-head", { table: "phase | action" }),
		evidence("picture", "new-head", { why: "The call crosses a process." }, "sequence.md"),
		evidence("equivalence", "new-head", { command: "bun run bench" }),
	];

	expect(evidenceText(rows)).toBe(`kind         head sha  file         caption
after        new-head  after.png    /reviews/170
before       old-head  before.png   /reviews/170
capture      new-head  -            /reviews/170
clip         new-head  proof.mp4    The dialog releases.
console      new-head  console.txt  -
verify       new-head  -            bun scripts/check.ts
test         new-head  -            lists the old head
test         new-head  -            The change deletes code only.
contract     new-head  -            -
migration    new-head  -            phase | action
picture      new-head  sequence.md  The call crosses a process.
equivalence  new-head  -            bun run bench
`);
});

test("prints the empty list marker", () => {
	expect(evidenceText([])).toBe("(none)\n");
});
