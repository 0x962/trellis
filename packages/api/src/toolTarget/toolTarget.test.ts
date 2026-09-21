import { expect, test } from "bun:test";
import { toolTarget } from "./toolTarget.ts";

test("names the file of an edit", () => {
	expect(toolTarget({ file_path: "apps/web/src/features/table/AgentLine/AgentLine.tsx" })).toBe(
		"apps/web/src/features/table/AgentLine/AgentLine.tsx",
	);
});

test("names the command of a shell call", () => {
	expect(toolTarget({ command: "bun test apps/web", description: "Run the web tests" })).toBe("bun test apps/web");
});

test("joins a command that arrives as a list of words", () => {
	expect(toolTarget({ command: ["bun", "run", "typecheck"] })).toBe("bun run typecheck");
});

test("takes the first line of a command that spans lines", () => {
	expect(toolTarget({ command: "cd apps/web\nbun test" })).toBe("cd apps/web");
});

test("cuts a long command to one screen line", () => {
	const target = toolTarget({ command: "echo ".repeat(60) })!;

	expect(target.length).toBe(120);
	expect(target.endsWith("…")).toBeTrue();
});

test("falls back to the description a tool writes for itself", () => {
	expect(toolTarget({ description: "Read the review threads" })).toBe("Read the review threads");
});

test("gives null for an input that names no target", () => {
	expect(toolTarget({ todos: [{ content: "Write the tests" }] })).toBeNull();
	expect(toolTarget(undefined)).toBeNull();
	expect(toolTarget("bun test")).toBeNull();
	expect(toolTarget({ command: "   " })).toBeNull();
});
