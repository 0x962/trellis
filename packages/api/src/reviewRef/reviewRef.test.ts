import { expect, test } from "bun:test";
import { reviewHref, reviewRef } from "./reviewRef";

test("canonicalizes short and embedded review references", () => {
	for (const input of [
		"Owner/Repo#12",
		"Owner/Repo/12",
		"https://github.com/Owner/Repo/pull/12",
		"http://margin.localhost/https://github.com/Owner/Repo/pull/12",
	]) {
		expect(reviewRef(input)).toEqual({
			owner: "owner",
			repo: "repo",
			number: 12,
			url: "https://github.com/owner/repo/pull/12",
		});
		expect(reviewHref(input)).toBe("/reviews/owner/repo/12");
	}
});

test("rejects malformed or unrelated URLs", () => {
	for (const input of [
		"https://evil.test/owner/repo/pull/12",
		"a/b#0",
		"a/b#1junk",
		"a/b#9007199254740992",
		"%invalid",
		"a/../12",
	]) {
		expect(() => reviewRef(input)).toThrow();
	}
});

test("accepts native review links", () => {
	expect(reviewRef("http://trellis.localhost/reviews/Owner/Repo/12#discussion").url).toBe(
		"https://github.com/owner/repo/pull/12",
	);
});
