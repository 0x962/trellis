import { expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";

test("home import preview and apply pass explicit paths to the offline helper", async () => {
	for (const operation of ["preview", "import"]) {
		const args = ["home-import", operation, "--source", "/tmp/source with spaces", "--target", "/tmp/target"];
		if (operation === "import") args.push("--expected-version", "a".repeat(64));
		const result = await runCli(args, {});
		expect(result.code).toBe(0);
		expect(result.calls).toEqual([]);
		expect(result.spawns[0]!.args).toEqual(
			expect.arrayContaining([operation, "--source", "/tmp/source with spaces", "--target", "/tmp/target"]),
		);
	}
});

test("home import rollback archives an explicit target without an API call", async () => {
	const result = await runCli([
		"home-import",
		"rollback",
		"--target",
		"/tmp/imported",
		"--archive",
		"/tmp/imported-archive",
	]);
	expect(result.code).toBe(0);
	expect(result.calls).toEqual([]);
	expect(result.spawns[0]!.args.slice(2)).toEqual([
		"rollback",
		"--target",
		"/tmp/imported",
		"--archive",
		"/tmp/imported-archive",
	]);
});
test("home import requires explicit paths and forwards maintenance failure", async () => {
	const missing = await runCli(["home-import", "import", "--source", "/tmp/source"]);
	expect(missing.code).not.toBe(0);
	expect(missing.spawns).toEqual([]);
	const failed = await runCli(
		["home-import", "preview", "--source", "/tmp/source", "--target", "/tmp/target"],
		{},
		{ spawn: () => ({ exited: Promise.resolve(1), kill: () => {} }) },
	);
	expect(failed.code).toBe(1);
});
