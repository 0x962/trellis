import { expect, test } from "bun:test";
import { workspaceErrorText } from "./workspaceError.ts";

test("the workspace failure names the step and keeps git's own words", () => {
	expect(workspaceErrorText("fatal: a branch named 'agent/TRL-18' already exists\n")).toBe(
		"Could not create the agent workspace with git worktree. fatal: a branch named 'agent/TRL-18' already exists",
	);
});

// git writes nothing to standard error when it dies on a signal. The sentence
// then ends after the step it names.
test("the workspace failure reads as one sentence when git says nothing", () => {
	expect(workspaceErrorText("")).toBe("Could not create the agent workspace with git worktree.");
});
