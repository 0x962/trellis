import { expect, test } from "bun:test";
import { codexTool } from "./codexTool.ts";

const command = (text: string, commandActions: Record<string, unknown>[] = [{ type: "unknown", command: text }]) => ({
	id: "exec",
	type: "commandExecution",
	command: text,
	commandActions,
});

// The commands come from recorded Codex items.
test("a shell call shows the script inside the login shell quotes", () => {
	expect(codexTool(command("/bin/zsh -lc ls")).input).toEqual({ command: "ls" });
	expect(codexTool(command("/bin/zsh -lc 'git status --short && git branch --show-current'")).input).toEqual({
		command: "git status --short && git branch --show-current",
	});
	expect(
		codexTool(command(`/bin/zsh -lc "rg -n 'OP-81|dashboard' \\"a b\\" \\$HOME"`, [{ type: "search", command: "rg" }])),
	).toEqual({ name: "Shell", input: { command: `rg -n 'OP-81|dashboard' "a b" $HOME` } });
});

test("a command whose every action reads a file is a file read", () => {
	expect(
		codexTool(
			command("/bin/zsh -lc 'cat /work/SKILL.md'", [
				{ type: "read", command: "cat /work/SKILL.md", name: "SKILL.md", path: "/work/SKILL.md" },
			]),
		),
	).toEqual({ name: "Read", input: { file_path: "/work/SKILL.md" } });
	expect(
		codexTool(
			command("/bin/zsh -lc 'cat a.md && ls'", [
				{ type: "read", command: "cat a.md", name: "a.md", path: "a.md" },
				{ type: "listFiles", command: "ls", path: null },
			]),
		).name,
	).toBe("Shell");
});

test("a web search that opens a page names the address", () => {
	expect(
		codexTool({ id: "ws", type: "webSearch", query: "", action: { type: "openPage", url: "https://bun.com/docs" } })
			.input,
	).toEqual({ query: "", url: "https://bun.com/docs" });
});
