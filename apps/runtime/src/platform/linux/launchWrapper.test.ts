import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// A plain directory stands in for the cgroup tree, so these tests run on any
// POSIX host. They prove the shell writes its own PID before it runs the agent
// and passes every argument through unchanged.
test("the launch shell records its PID in a new cgroup and runs the agent with the same PID", () => {
	const agent = join(scratch, "agent");
	writeFileSync(agent, '#!/bin/sh\nprintf "%s|" "$$" "$@"\n');
	chmodSync(agent, 0o755);
	const cgroup = join(scratch, "launch-one");
	const args = ["two words", "it's", '"quoted"', "$HOME", ""];
	const wrapped = wrapLinuxLaunch({ id: "a", command: agent, args, cwd: scratch, mode: "stdio" }, cgroup, () => true);
	const result = spawnSync(wrapped.command, wrapped.args, { cwd: scratch, encoding: "utf8" });
	expect(result.stderr).toBe("");
	expect(result.status).toBe(0);
	const [pid, ...received] = result.stdout.split("|").slice(0, -1);
	expect(received).toEqual(args);
	expect(readFileSync(join(cgroup, "cgroup.procs"), "utf8")).toBe(pid!);
});

test("an existing cgroup ends the launch shell with code 125 before the agent runs", () => {
	const stale = join(scratch, "launch-stale");
	mkdirSync(stale);
	writeFileSync(join(stale, "cgroup.procs"), "77\n");
	const wrapped = wrapLinuxLaunch(
		{ id: "a", command: "/bin/echo", args: ["ran"], cwd: scratch, mode: "stdio" },
		stale,
		() => true,
	);
	const result = spawnSync(wrapped.command, wrapped.args, { cwd: scratch, encoding: "utf8" });
	expect(result.status).toBe(125);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain(`trellis: cannot create the attempt cgroup ${stale}`);
	expect(readFileSync(join(stale, "cgroup.procs"), "utf8")).toBe("77\n");
});

test("an unwritable cgroup parent ends the launch shell with code 125 before the agent runs", () => {
	const cgroup = join(scratch, "launch-unwritable");
	const wrapped = wrapLinuxLaunch(
		{ id: "a", command: "/bin/echo", args: ["ran"], cwd: scratch, mode: "stdio" },
		cgroup,
		() => true,
	);
	chmodSync(scratch, 0o555);
	const result = spawnSync(wrapped.command, wrapped.args, { cwd: scratch, encoding: "utf8" });
	chmodSync(scratch, 0o755);
	expect(result.status).toBe(125);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain(`trellis: cannot create the attempt cgroup ${cgroup}`);
});
