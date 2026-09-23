import { expect, test } from "bun:test";
import {
	attemptsToRemove,
	heldScratchNames,
	outputFilesToRemove,
	type SweepRun,
	workspaceRemovable,
} from "./decide.ts";

const work = "/home/agents/01RUN/work";
const run = (overrides: Partial<SweepRun> = {}): SweepRun => ({
	id: "01RUN",
	kind: "agent",
	runtime: "native",
	workspaceId: work,
	terminalId: "t1",
	open: false,
	ticketCategory: "done",
	...overrides,
});

test("a closed run on a done ticket frees its worktree", () => {
	expect(workspaceRemovable(work, [run()], [])).toBe(true);
});

test("a canceled ticket frees the worktree too", () => {
	expect(workspaceRemovable(work, [run({ ticketCategory: "canceled" })], [])).toBe(true);
});

test("an open run keeps the worktree", () => {
	expect(workspaceRemovable(work, [run({ open: true })], [])).toBe(false);
});

test("a ticket in review keeps the worktree", () => {
	expect(workspaceRemovable(work, [run({ ticketCategory: "review" })], [])).toBe(false);
});

test("a run without a ticket keeps the worktree", () => {
	expect(workspaceRemovable(work, [run({ ticketCategory: null })], [])).toBe(false);
});

test("a scratch session keeps the worktree", () => {
	expect(workspaceRemovable(work, [run({ kind: "session" })], [])).toBe(false);
});

test("a later run that works in the worktree of an earlier run keeps it", () => {
	const later = run({ id: "01LATER", open: true, ticketCategory: "started", terminalId: "t2" });
	expect(workspaceRemovable(work, [run(), later], [])).toBe(false);
});

test("a running process of an owner keeps the worktree", () => {
	expect(workspaceRemovable(work, [run()], [{ id: "t1", cwd: null }])).toBe(false);
});

test("a running process inside the worktree keeps it", () => {
	expect(workspaceRemovable(work, [run()], [{ id: "other", cwd: `${work}/apps/web` }])).toBe(false);
	expect(workspaceRemovable(work, [run()], [{ id: "other", cwd: "/home/agents/01RUN/workshop" }])).toBe(true);
});

test("a worktree that no run refers to may go", () => {
	expect(workspaceRemovable(work, [run({ id: "01OTHER", workspaceId: "/elsewhere", open: true })], [])).toBe(true);
});

test("the output of earlier terminals and the native copy go, the current terminal stays", () => {
	const names = ["output.txt", "output-t0.txt", "output-t1.txt", "harness.json"];
	expect(outputFilesToRemove(names, run({ terminalId: "t1" }))).toEqual(["output.txt", "output-t0.txt"]);
});

test("a run outside the native runtime keeps output.txt", () => {
	expect(outputFilesToRemove(["output.txt", "output-t0.txt"], run({ runtime: "docker", terminalId: null }))).toEqual([
		"output-t0.txt",
	]);
});

test("a run whose row is gone keeps no output file", () => {
	expect(outputFilesToRemove(["output.txt", "output-t0.txt", "notes.md"], undefined)).toEqual([
		"output.txt",
		"output-t0.txt",
	]);
});

test("an attempt that no run holds and that is old enough goes", () => {
	const hour = 3_600_000;
	const now = 10 * hour;
	const attempts = [
		{ id: "current", modifiedAt: 0 },
		{ id: "old", modifiedAt: now - 2 * hour },
		{ id: "young", modifiedAt: now - hour / 2 },
	];
	expect(attemptsToRemove(attempts, new Set(["current"]), now, hour)).toEqual(["old"]);
});

test("an open file names the scratch directory that holds it, in both spellings of the root", () => {
	const paths = [
		"/private/var/folders/x/T/trellis-trl404/repo/node_modules/bun",
		"/var/folders/x/T/trellis-wo47/runtime/runtime.sock",
		"/var/folders/x/T/other-tool/data",
		// The working directory of a process is the directory itself.
		"/private/var/folders/x/T/trellis-wave",
		"/Users/navid/projects/trellis/trellis-elsewhere/file",
	];
	const names = heldScratchNames(paths, ["/var/folders/x/T", "/private/var/folders/x/T"]);
	expect([...names].sort()).toEqual(["trellis-trl404", "trellis-wave", "trellis-wo47"]);
});
