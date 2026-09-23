import { expect, test } from "bun:test";
import { toolTarget } from "./toolTarget.ts";

test("names the file of an edit", () => {
	expect(toolTarget({ file_path: "apps/web/src/features/table/AgentLine/AgentLine.tsx" })).toEqual({
		text: "apps/web/src/features/table/AgentLine/AgentLine.tsx",
		kind: "code",
	});
});

test("names the command of a shell call", () => {
	expect(toolTarget({ command: "bun test apps/web", description: "Run the web tests" })).toEqual({
		text: "bun test apps/web",
		kind: "code",
	});
});

test("joins a command that arrives as a list of words", () => {
	expect(toolTarget({ command: ["bun", "run", "typecheck"] })).toEqual({ text: "bun run typecheck", kind: "code" });
});

test("takes the first line of a command that spans lines", () => {
	expect(toolTarget({ command: "cd apps/web\nbun test" })).toEqual({ text: "cd apps/web", kind: "code" });
});

test("cuts a long command to one screen line", () => {
	const target = toolTarget({ command: "echo ".repeat(60) })!;

	expect(target.text.length).toBe(120);
	expect(target.text.endsWith("…")).toBeTrue();
});

test("falls back to the description a tool writes for itself", () => {
	expect(toolTarget({ description: "Read the review threads" })).toEqual({
		text: "Read the review threads",
		kind: "text",
	});
});

test("keeps a search query in the text font", () => {
	expect(toolTarget({ query: "best way to write review comments" })).toEqual({
		text: "best way to write review comments",
		kind: "text",
	});
});

test("gives null for an input that names no target", () => {
	expect(toolTarget({ todos: [{ content: "Write the tests" }] })).toBeNull();
	expect(toolTarget(undefined)).toBeNull();
	expect(toolTarget("bun test")).toBeNull();
	expect(toolTarget({ command: "   " })).toBeNull();
});
