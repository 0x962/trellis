import { expect, test } from "bun:test";
import { hostServicePreflight } from "./preflight.ts";

test("runs the systemd preflight inside a delegated transient user unit", async () => {
	const calls: string[][] = [];
	await hostServicePreflight({
		releaseRoot: "/release",
		context: "systemd",
		executable: "/release/bin/bun",
		preflightScript: "/source/scripts/host-release/preflight.ts",
		run: async (args) => {
			calls.push(args);
			return { code: 0, stdout: "", stderr: "" };
		},
	});

	expect(calls).toEqual([
		[
			"systemd-run",
			"--user",
			"--quiet",
			"--wait",
			"--pipe",
			"--collect",
			"--property=Type=exec",
			"--property=Delegate=yes",
			"/release/bin/bun",
			"/source/scripts/host-release/preflight.ts",
			"--release",
			"/release",
		],
	]);
});

test("runs the foreground preflight in the supervisor process", async () => {
	const calls: string[][] = [];
	await hostServicePreflight({
		releaseRoot: "/release",
		context: "foreground",
		executable: "/release/bin/bun",
		preflightScript: "/source/scripts/host-release/preflight.ts",
		run: async (args) => {
			calls.push(args);
			return { code: 0, stdout: "", stderr: "" };
		},
	});

	expect(calls).toEqual([
		["/release/bin/bun", "/source/scripts/host-release/preflight.ts", "--release", "/release"],
	]);
});
