import { describe, expect, test } from "bun:test";
import { marginOrigin, marginUrl } from "./marginUrl";

describe("marginUrl", () => {
	// PR-30. margin routes on the whole pull request URL after its own
	// origin, so the URL keeps its own scheme and its own slashes.
	test("appends the whole pull request URL after one slash", () => {
		const pr = "https://github.com/canary-technologies-corp/de/pull/118";
		expect(marginUrl(pr)).toBe(`http://margin.localhost/${pr}`);
		expect(marginUrl(pr)).toContain("https://github.com");
		expect(marginUrl(pr)).not.toContain("%3A");
		expect(marginUrl(pr).endsWith("/")).toBe(false);
	});

	// PR-72. The frame asks this address whether margin answers, so it names
	// the gateway alone and no pull request.
	test("names margin's own origin with a trailing slash", () => {
		expect(marginOrigin).toBe("http://margin.localhost/");
		expect(new URL(marginOrigin).pathname).toBe("/");
	});
});
