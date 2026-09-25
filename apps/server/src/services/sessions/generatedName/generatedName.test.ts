import { expect, test } from "bun:test";
import { checkGeneratedName } from "./generatedName";

test.each(["Codex login fix", "TRL-477 login fix", "abcdef1 login fix", "trellis/trl-477-name login fix"])(
	"a generated name rejects a protected term from outside the user request: %s",
	(name) => {
		expect(() => checkGeneratedName("Fix the login tests.", name)).toThrow(
			"The session name contains a term that the user did not make the subject",
		);
	},
);

test("a generated name keeps a protected term that is the subject of the request", () => {
	expect(checkGeneratedName("Explain Codex output.", "Explain Codex output")).toBe("Explain Codex output");
});
