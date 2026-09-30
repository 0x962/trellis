import { describe, expect, test } from "bun:test";
import type { Mergeable } from "@trellis/api";
import type { StoredNotice } from "./checkNotice.ts";
import { type ConflictSubject, decideConflictNotice } from "./conflictNotice.ts";

const subject = (mergeable: Mergeable, isDraft: boolean, headSha = "aaa1111"): ConflictSubject => ({
	state: "open",
	isDraft,
	headSha,
	mergeable,
});

const notice = (kind: "conflict" | "clear", headSha: string): StoredNotice => ({ headSha, kind, checks: [] });

describe.each([false, true])("decideConflictNotice with GitHub draft %s", (isDraft) => {
	const pr = (mergeable: Mergeable, headSha = "aaa1111") => subject(mergeable, isDraft, headSha);
	test("a conflict sends once per head commit", () => {
		expect(decideConflictNotice(pr("conflicting"), [])).toEqual({ kind: "conflict", checks: [] });
		expect(decideConflictNotice(pr("conflicting"), [notice("conflict", "aaa1111")])).toBeNull();
		expect(decideConflictNotice(pr("conflicting", "bbb2222"), [notice("conflict", "aaa1111")])).toEqual({
			kind: "conflict",
			checks: [],
		});
	});

	test("unknown sends nothing, whatever the notices say", () => {
		expect(decideConflictNotice(pr("unknown"), [])).toBeNull();
		expect(decideConflictNotice(pr("unknown", "bbb2222"), [notice("conflict", "aaa1111")])).toBeNull();
	});

	test("a mergeable head after a conflict notice sends one clear", () => {
		const conflict = [notice("conflict", "aaa1111")];
		expect(decideConflictNotice(pr("mergeable", "bbb2222"), conflict)).toEqual({ kind: "clear", checks: [] });
		expect(decideConflictNotice(pr("mergeable", "bbb2222"), [...conflict, notice("clear", "bbb2222")])).toBeNull();
	});

	test("a mergeable head with no conflict notice sends nothing", () => {
		expect(decideConflictNotice(pr("mergeable"), [])).toBeNull();
	});

	test("a conflict that returns after a clear sends again, also on the same head", () => {
		const notices = [notice("conflict", "aaa1111"), notice("clear", "aaa1111")];
		expect(decideConflictNotice(pr("conflicting"), notices)).toEqual({ kind: "conflict", checks: [] });
	});

	test("a closed or merged pull request sends nothing", () => {
		expect(decideConflictNotice({ ...pr("conflicting"), state: "closed" }, [])).toBeNull();
		expect(decideConflictNotice({ ...pr("conflicting"), state: "merged" }, [])).toBeNull();
	});
});
