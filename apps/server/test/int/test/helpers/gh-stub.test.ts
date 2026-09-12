import { originDir } from "../../../../../../test/originDir.ts";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ghStub } from "../../../helpers/gh-stub.ts";

// ghStub points the gh runner at test/stubs/gh.ts for one test. It writes the
// reply map into a scratch directory and sets the three TRELLIS_GH_* variables.
// restore() puts the variables back, so one test never leaks into the next.
const stubPath = join(originDir(import.meta.dir), "..", "stubs", "gh.ts");
const envKeys = ["TRELLIS_GH_BIN", "TRELLIS_GH_STUB_FILE", "TRELLIS_GH_STUB_LOG"] as const;

const spawnStub = async (args: string[]) => {
	const proc = Bun.spawn([process.env.TRELLIS_GH_BIN!, ...args], {
		env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	await proc.exited;
	return stdout;
};

describe("ghStub", () => {
	test("ghStub writes the reply file and points the env at the stub", () => {
		const before = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
		const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-helper-"));
		const handle = ghStub(dir, { "auth status": { stdout: "ok", stderr: "", exitCode: 0 } });
		expect(process.env.TRELLIS_GH_BIN).toBe(stubPath);
		expect(process.env.TRELLIS_GH_STUB_FILE!.startsWith(dir)).toBe(true);
		expect(process.env.TRELLIS_GH_STUB_LOG!.startsWith(dir)).toBe(true);
		expect(existsSync(process.env.TRELLIS_GH_STUB_FILE!)).toBe(true);
		expect(JSON.parse(readFileSync(process.env.TRELLIS_GH_STUB_FILE!, "utf8"))).toEqual({
			"auth status": { stdout: "ok", stderr: "", exitCode: 0 },
		});
		expect(handle.spawns).toBeFunction();
		expect(handle.reply).toBeFunction();
		expect(handle.restore).toBeFunction();
		expect(handle.spawns()).toEqual([]);
		handle.restore();
		expect(Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))).toEqual(before);
	});

	test("ghStub updates replies, reads the spawn log, and restores the env", async () => {
		const before = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
		const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-helper-"));
		const handle = ghStub(dir, { "auth status": { stdout: "ok", stderr: "", exitCode: 0 } });
		handle.reply("api graphql", { stdout: '{"data":{}}', stderr: "", exitCode: 0 });
		expect(await spawnStub(["api", "graphql", "-f", "query=x"])).toBe('{"data":{}}');
		expect(await spawnStub(["auth", "status"])).toBe("ok");
		const spawns = handle.spawns();
		expect(spawns).toHaveLength(2);
		expect(spawns[0]).toMatchObject({ args: ["api", "graphql", "-f", "query=x"], env: { NO_COLOR: "1" } });
		expect(spawns[1]).toMatchObject({ args: ["auth", "status"], env: { GH_PROMPT_DISABLED: "1" } });
		expect(spawns[0]!.at).toBeNumber();
		handle.restore();
		expect(Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))).toEqual(before);
		expect(handle.spawns()).toEqual([]);
	});
});
