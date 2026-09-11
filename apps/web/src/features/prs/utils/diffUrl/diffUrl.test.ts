import { describe, expect, test } from "bun:test";
import { diffUrl } from "./diffUrl";

describe("diffUrl", () => {
	// PR-30. The default template opens the Files changed tab of the pull
	// request on GitHub.
	test("the default template appends the diff path to the pull request URL", () => {
		const pr = "https://github.com/acme/web/pull/118";
		expect(diffUrl("{url}/files", pr)).toBe(`${pr}/files`);
	});

	// A viewer that routes on the whole pull request URL after its own
	// origin gets the URL with its own scheme and its own slashes.
	test("a template that holds the URL after one slash keeps the whole URL", () => {
		const pr = "https://github.com/acme/web/pull/118";
		const url = diffUrl("http://diff.localhost/{url}", pr);
		expect(url).toBe(`http://diff.localhost/${pr}`);
		expect(url).toContain("https://github.com");
		expect(url).not.toContain("%3A");
		expect(url.endsWith("/")).toBe(false);
	});
});
