import { originDir } from "../../../../../../test/originDir.ts";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The stub stands in for the gh binary. It answers from TRELLIS_GH_STUB_FILE,
// a JSON map keyed by the first two args, and appends one JSON line per spawn
// to TRELLIS_GH_STUB_LOG. These tests spawn it the way run.ts does.
const stubPath = join(originDir(import.meta.dir), "gh.ts");

type Reply = { stdout: string; stderr: string; exitCode: number; delayMs?: number };

const scratch = (replies: Record<string, Reply>) => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-stub-"));
	const file = join(dir, "replies.json");
	const log = join(dir, "spawns.log");
	writeFileSync(file, JSON.stringify(replies));
	return { dir, file, log };
};

const spawn = async (args: string[], env: Record<string, string>) => {
	const started = Date.now();
	const proc = Bun.spawn([stubPath, ...args], {
		env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1", ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode, elapsedMs: Date.now() - started };
};

const logLines = (log: string) =>
	readFileSync(log, "utf8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line));

describe("gh stub", () => {
	test("the stub runs as a binary through its shebang and answers by the first two args", async () => {
		expect(readFileSync(stubPath, "utf8")).toStartWith("#!/usr/bin/env bun");
		const { file, log } = scratch({ "auth status": { stdout: "ok\n", stderr: "", exitCode: 0 } });
		const result = await spawn(["auth", "status"], { TRELLIS_GH_STUB_FILE: file, TRELLIS_GH_STUB_LOG: log });
		expect(result.stdout).toBe("ok\n");
		expect(result.stderr).toBe("");
		expect(result.exitCode).toBe(0);
	});

	test("the stub passes stdout, stderr, and exitCode through and ignores extra args", async () => {
		const { file, log } = scratch({ "pr checks": { stdout: "[]", stderr: "no checks reported", exitCode: 8 } });
		const result = await spawn(["pr", "checks", "https://github.com/o/r/pull/1"], {
			TRELLIS_GH_STUB_FILE: file,
			TRELLIS_GH_STUB_LOG: log,
		});
		expect(result.stdout).toBe("[]");
		expect(result.stderr).toBe("no checks reported");
		expect(result.exitCode).toBe(8);
	});

	test("the stub exits 1 and names the missing key", async () => {
		const { file, log } = scratch({ "auth status": { stdout: "ok\n", stderr: "", exitCode: 0 } });
		const result = await spawn(["pr", "view", "https://github.com/o/r/pull/1"], {
			TRELLIS_GH_STUB_FILE: file,
			TRELLIS_GH_STUB_LOG: log,
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toBe("no stub reply for pr view");
	});

	test("the stub appends one JSON line per spawn to TRELLIS_GH_STUB_LOG", async () => {
		const { file, log } = scratch({
			"auth status": { stdout: "ok\n", stderr: "", exitCode: 0 },
			"api graphql": { stdout: "{}", stderr: "", exitCode: 0 },
		});
		const env = { TRELLIS_GH_STUB_FILE: file, TRELLIS_GH_STUB_LOG: log };
		await spawn(["auth", "status"], env);
		await spawn(["api", "graphql", "-f", "query=x"], env);
		await spawn(["auth", "status"], env);
		const lines = logLines(log);
		expect(lines).toHaveLength(3);
		expect(lines.map((line) => line.args)).toEqual([
			["auth", "status"],
			["api", "graphql", "-f", "query=x"],
			["auth", "status"],
		]);
		for (const line of lines) {
			expect(line.env).toMatchObject({ GH_PROMPT_DISABLED: "1", NO_COLOR: "1" });
			expect(line.at).toBeNumber();
			expect(line.pid).toBeNumber();
		}
		expect(lines[0].at).toBeLessThanOrEqual(lines[1].at);
		expect(lines[1].at).toBeLessThanOrEqual(lines[2].at);
	});

	test("the stub honors delayMs and logs before it waits", async () => {
		const { file, log } = scratch({ "auth status": { stdout: "slow\n", stderr: "", exitCode: 0, delayMs: 200 } });
		const proc = Bun.spawn([stubPath, "auth", "status"], {
			env: { ...process.env, TRELLIS_GH_STUB_FILE: file, TRELLIS_GH_STUB_LOG: log },
			stdout: "pipe",
			stderr: "pipe",
		});
		const started = Date.now();
		await Bun.sleep(100);
		expect(existsSync(log)).toBe(true);
		expect(logLines(log)).toHaveLength(1);
		expect(proc.exitCode).toBeNull();
		const stdout = await new Response(proc.stdout).text();
		await proc.exited;
		expect(Date.now() - started).toBeGreaterThanOrEqual(200);
		expect(stdout).toBe("slow\n");
	});
});
