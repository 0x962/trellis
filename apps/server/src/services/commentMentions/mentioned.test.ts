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
