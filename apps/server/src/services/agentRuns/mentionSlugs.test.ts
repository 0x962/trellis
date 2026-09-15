import { describe, expect, test } from "bun:test";
import { mentionSlugs } from "./mentionSlugs.ts";

describe("mentionSlugs", () => {
	test("reads each persona slug once, in the order it appears", () => {
		expect(mentionSlugs("@feature-builder and @code-clarity, then @feature-builder again")).toEqual([
			"feature-builder",
			"code-clarity",
		]);
	});

	test("a body without a mention holds no slug", () => {
		expect(mentionSlugs("No mention here. Read the diff.")).toEqual([]);
	});

	test("an email address and a code path hold no mention", () => {
		expect(mentionSlugs("Mail navid@example.com about @trellis/api and read a@b.")).toEqual([]);
	});

	test("a mention ends at the first character outside the slug grammar", () => {
		expect(mentionSlugs("Ask @docs-writer. Then ask @qa!")).toEqual(["docs-writer", "qa"]);
	});

	test("an upper case name is not a slug", () => {
		expect(mentionSlugs("@Docs-Writer")).toEqual([]);
	});

	test("inline code holds no mention", () => {
		expect(mentionSlugs("Use `@feature-builder` to start it.")).toEqual([]);
		expect(mentionSlugs("Both `@a-one` and ``@a-two`` stay text.")).toEqual([]);
	});

	test("a fenced block holds no mention", () => {
		expect(mentionSlugs("Read this:\n\n```\n@feature-builder\n```\n")).toEqual([]);
		expect(mentionSlugs("~~~\n@feature-builder\n~~~")).toEqual([]);
	});

	test("a quoted line holds a mention", () => {
		expect(mentionSlugs("> @feature-builder please start")).toEqual(["feature-builder"]);
	});

	test("a bare domain holds no mention", () => {
		expect(mentionSlugs("see @example.com for the rule")).toEqual([]);
	});

	test("a fence with no closing line holds no mention to the end of the body", () => {
		expect(mentionSlugs("```\n@feature-builder failed\n")).toEqual([]);
		expect(mentionSlugs("@docs-writer read this:\n~~~\n@feature-builder failed")).toEqual(["docs-writer"]);
	});

	test("an indented code block holds no mention", () => {
		expect(mentionSlugs("\n\n    @feature-builder exited 1\n")).toEqual([]);
		expect(mentionSlugs("Log:\n\n\t@feature-builder exited 1\n\n@docs-writer look")).toEqual(["docs-writer"]);
	});

	test("an indented line that continues a paragraph still holds a mention", () => {
		expect(mentionSlugs("Please look,\n    @feature-builder")).toEqual(["feature-builder"]);
	});

	test("a URL holds no mention", () => {
		expect(mentionSlugs("https://medium.com/@feature-builder")).toEqual([]);
		expect(mentionSlugs("Read https://x.com/?u=@feature-builder and docs/@docs-writer")).toEqual([]);
	});

	test("a fence marker inside a line opens no fence", () => {
		expect(mentionSlugs("Wrap logs in ``` please. @feature-builder look")).toEqual(["feature-builder"]);
		expect(mentionSlugs("Wrap logs in ~~~ please. @feature-builder look")).toEqual(["feature-builder"]);
	});

	test("a mention outside a fence still counts", () => {
		expect(mentionSlugs("```\n@ignored-one\n```\n\n@docs-writer please read it.")).toEqual(["docs-writer"]);
	});

	test("a fence inside a quote or a list item holds no mention", () => {
		expect(mentionSlugs("> ```\n> @x\n> ```\n@y")).toEqual(["y"]);
		expect(mentionSlugs("- ```\n  @x\n  ```\n@y")).toEqual(["y"]);
		expect(mentionSlugs("1. ~~~\n   @x\n   ~~~\n@y")).toEqual(["y"]);
		expect(mentionSlugs("> > ```\n> > @x")).toEqual([]);
	});
});
