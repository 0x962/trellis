import { describe, expect, test } from "bun:test";
import { marginUrl } from "./marginUrl";

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
});
