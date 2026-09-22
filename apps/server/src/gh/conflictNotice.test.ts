import { describe, expect, test } from "bun:test";
import type { Mergeable } from "@trellis/api";
import type { StoredNotice } from "./checkNotice.ts";
import { type ConflictSubject, decideConflictNotice } from "./conflictNotice.ts";

const subject = (mergeable: Mergeable, headSha = "aaa1111"): ConflictSubject => ({
	state: "open",
	isDraft: false,
	headSha,
	mergeable,
});

const notice = (kind: "conflict" | "clear", headSha: string): StoredNotice => ({ headSha, kind, checks: [] });

describe("decideConflictNotice", () => {
	test("a conflict sends once per head commit", () => {
		expect(decideConflictNotice(subject("conflicting"), [])).toEqual({ kind: "conflict", checks: [] });
		expect(decideConflictNotice(subject("conflicting"), [notice("conflict", "aaa1111")])).toBeNull();
		expect(decideConflictNotice(subject("conflicting", "bbb2222"), [notice("conflict", "aaa1111")])).toEqual({
			kind: "conflict",
			checks: [],
		});
	});

	test("unknown sends nothing, whatever the notices say", () => {
		expect(decideConflictNotice(subject("unknown"), [])).toBeNull();
		expect(decideConflictNotice(subject("unknown", "bbb2222"), [notice("conflict", "aaa1111")])).toBeNull();
	});

	test("a mergeable head after a conflict notice sends one clear", () => {
		const conflict = [notice("conflict", "aaa1111")];
		expect(decideConflictNotice(subject("mergeable", "bbb2222"), conflict)).toEqual({ kind: "clear", checks: [] });
		expect(decideConflictNotice(subject("mergeable", "bbb2222"), [...conflict, notice("clear", "bbb2222")])).toBeNull();
	});

	test("a mergeable head with no conflict notice sends nothing", () => {
		expect(decideConflictNotice(subject("mergeable"), [])).toBeNull();
	});

	test("a conflict that returns after a clear sends again, also on the same head", () => {
		const notices = [notice("conflict", "aaa1111"), notice("clear", "aaa1111")];
		expect(decideConflictNotice(subject("conflicting"), notices)).toEqual({ kind: "conflict", checks: [] });
	});

	test("a closed, merged, or GitHub draft pull request sends nothing", () => {
		expect(decideConflictNotice({ ...subject("conflicting"), state: "closed" }, [])).toBeNull();
		expect(decideConflictNotice({ ...subject("conflicting"), state: "merged" }, [])).toBeNull();
		expect(decideConflictNotice({ ...subject("conflicting"), isDraft: true }, [])).toBeNull();
	});
});
