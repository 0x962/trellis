import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeDeps, runCli } from "../../test/deps.ts";

test("the CLI refuses agent commands and role flags before any effect", async () => {
	for (const argv of [
		["agents", "--help"],
		["instructions", "--role", "manager"],
		["instructions", "--ticket", "CDE-42"],
		["instructions", "--pr", "https://github.com/acme/repo/pull/1"],
		["serve", "--superset-bin", "/test/bin/superset"],
		["install", "--superset-bin", "/test/bin/superset"],
	]) {
		const result = await runCli(argv);
		expect(result.code, argv.join(" ")).toBe(2);
		expect(result.calls).toEqual([]);
		expect(result.commands).toEqual([]);
		expect(result.spawns).toEqual([]);
	}
});

test("the root help omits the agents command", async () => {
	const result = await runCli(["--help"]);
	expect(result.code).toBe(0);
	expect(result.stdout).not.toMatch(/^\s+agents\s/m);
});

test("serve starts the server without a Superset lookup", async () => {
	const asked: string[] = [];
	const result = await runCli(
		["serve"],
		{},
		{
			which: (name) => {
				asked.push(name);
				return `/test/bin/${name}`;
			},
		},
	);
	expect(result.code, result.stderr).toBe(0);
	expect(asked).toEqual([]);
	expect(result.spawns).toHaveLength(1);
	expect(result.spawns[0]!.env).not.toHaveProperty("TRELLIS_SUPERSET_BIN");
});

test("install needs only Bun and writes no Superset configuration", async () => {
	const { deps } = makeDeps();
	const asked: string[] = [];
	const result = await runCli(
		["install", "--no-launchd"],
		{},
		{
			home: deps.home,
			which: (name) => {
				asked.push(name);
				return name === "bun" ? "/test/bin/bun" : null;
			},
		},
	);
	expect(result.code, result.stderr).toBe(0);
	expect(asked).toEqual(["bun"]);
	expect(result.stderr).toBe("");
	expect(readFileSync(join(deps.home, "Library", "LaunchAgents", "com.trellis.server.plist"), "utf8")).not.toContain(
		"TRELLIS_SUPERSET_BIN",
	);
});
