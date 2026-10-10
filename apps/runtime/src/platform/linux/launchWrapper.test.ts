import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLinuxExecutable, wrapLinuxLaunch } from "./launchWrapper.ts";

const scratch = mkdtempSync(join(tmpdir(), "trellis-launch-wrapper-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

test("a bare command requires PATH", () => {
	expect(() => resolveLinuxExecutable("agent", "/work", {}, () => true)).toThrow(
		"PATH is required to find executable agent",
	);
});

test("an empty PATH entry searches the launch directory", () => {
	const inspected: string[] = [];
	const found = resolveLinuxExecutable("agent", "/work", { PATH: ":/bin" }, (path) => {
		inspected.push(path);
		return path === "/work/agent";
	});
	expect(found).toBe("/work/agent");
	expect(inspected).toEqual(["/work/agent"]);
});

test("a missing command fails before the launch", () => {
	expect(() =>
		wrapLinuxLaunch(
			{ id: "a", command: "agent", args: [], cwd: "/work", mode: "stdio", env: { PATH: "/bin" } },
			"/root",
			() => false,
		),
	).toThrow("Cannot find executable agent on PATH");
});

// A plain directory stands in for the cgroup tree, so this test runs on any
// POSIX host. It proves the shell writes its own PID before it runs the agent
// and passes every argument through unchanged.
test("the launch shell records its PID in the session cgroup and runs the agent with the same PID", () => {
	const agent = join(scratch, "agent");
	writeFileSync(agent, '#!/bin/sh\nprintf "%s|" "$$" "$@"\n');
	chmodSync(agent, 0o755);
	const args = ["two words", "it's", '"quoted"', "$HOME", ""];
	const wrapped = wrapLinuxLaunch({ id: "a", command: agent, args, cwd: scratch, mode: "stdio" }, scratch, () => true);
	const result = spawnSync(wrapped.command, wrapped.args, { cwd: scratch, encoding: "utf8" });
	expect(result.stderr).toBe("");
	expect(result.status).toBe(0);
	const [pid, ...received] = result.stdout.split("|").slice(0, -1);
	expect(received).toEqual(args);
	expect(readFileSync(join(scratch, `session-${pid}`, "cgroup.procs"), "utf8")).toBe(pid!);
});

test("a failed cgroup join ends the launch shell with code 125 before the agent runs", () => {
	const blocked = join(scratch, "blocked");
	writeFileSync(blocked, "");
	const wrapped = wrapLinuxLaunch(
		{ id: "a", command: "/bin/echo", args: ["ran"], cwd: scratch, mode: "stdio" },
		blocked,
		() => true,
	);
	const result = spawnSync(wrapped.command, wrapped.args, { cwd: scratch, encoding: "utf8" });
	expect(result.status).toBe(125);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("trellis: cannot join the attempt cgroup");
});
