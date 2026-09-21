import { describe, expect, test } from "bun:test";
import { browserHost, browserTitle } from "./browserTitle";

describe("browserTitle", () => {
	test("shows the host until the page sends its title", () => {
		expect(browserTitle("", "https://github.com/o/r/pull/7")).toBe("github.com");
		expect(browserTitle("Add the wave column by o · Pull Request #7", "https://github.com/o/r/pull/7")).toBe(
			"Add the wave column by o · Pull Request #7",
		);
	});

	test("shows an address it cannot parse as it stands", () => {
		expect(browserHost("not a URL")).toBe("not a URL");
	});
});
