import { expect, test } from "bun:test";
import { mentionedNames } from "./mentioned.ts";

test("a full persona name takes precedence over its prefix", () => {
	expect([...mentionedNames("@Code separation review this", ["Code", "Code separation"])]).toEqual(["code separation"]);
	expect([...mentionedNames("@Code check this. @Code separation review it.", ["Code", "Code separation"])]).toEqual([
		"code",
		"code separation",
	]);
});

test("mentions match full names without letter case or regular expression syntax", () => {
	expect([...mentionedNames("@C++ and @BUILDER.", ["C++", "Builder"])]).toEqual(["c++", "builder"]);
	expect([...mentionedNames("name@builder.com @builder-extra `@builder`", ["Builder"])]).toEqual([]);
});

test("an unfinished fenced code block does not notify a persona", () => {
	expect([...mentionedNames("Example:\n```\n@Builder", ["Builder"])]).toEqual([]);
});

test.each([
	["backticks in the middle of a line", "Wrap logs in ``` please. @Builder look", ["builder"]],
	["a tilde fence", "~~~\n@Builder\n~~~\n@Reviewer", ["reviewer"]],
	["an indented code block", "Log:\n\n    @Builder exited 1\n\n@Reviewer look", ["reviewer"]],
	["a URL", "Read https://x.com/?u=@Builder and docs/@Reviewer", []],
	["CRLF endings", "```\r\n@Builder\r\n```\r\n@Reviewer", ["reviewer"]],
	["a closing fence that does not start a line", "```\n@Builder\ntext ``` @Reviewer", []],
	["a fence in a quote", "> ```\n> @Builder\n> ```\n@Reviewer", ["reviewer"]],
	["a fence at the start of a list item", "- ```\n  @Builder\n  ```\n@Reviewer", ["reviewer"]],
] as const)("markdown excludes %s", (_name, body, expected) => {
	expect([...mentionedNames(body, ["Builder", "Reviewer"])]).toEqual([...expected]);
});
