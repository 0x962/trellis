import { describe, expect, test } from "bun:test";
import { docTitle, planTitle } from "./epicDocs";

describe("planTitle", () => {
	test("takes the text of the first heading", () => {
		expect(planTitle("# Trellis for one human\n\n## The goal")).toBe("Trellis for one human");
		expect(planTitle("The goal: build it.\n\n## Waves ##\n# Later")).toBe("Waves");
	});

	test("says Untitled when the description has no heading", () => {
		expect(planTitle("")).toBe("Untitled");
		expect(planTitle("The goal: build it.\n#hashtag is no heading")).toBe("Untitled");
	});
});

describe("docTitle", () => {
	test("says Untitled for an empty name and keeps any other name", () => {
		expect(docTitle("")).toBe("Untitled");
		expect(docTitle("Research notes")).toBe("Research notes");
	});
});
