import { originDir } from "../../originDir.ts";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createRunRoot, RUN_ROOT_PREFIX, sweepDeadRoots } from "../../runRoot.ts";

const repoRoot = join(originDir(import.meta.dir), "..");
const fixture = "./test/fixtures/runRoot.ts";

// A nested `bun test` of the fixture. Its preload makes its own run root.
const envOf = (mode: string) => ({ ...process.env, TRELLIS_ROOT_FIXTURE: mode });

const rootIn = (output: string) => /ROOT=(\S+)/.exec(output)![1]!;

// Reads the stdout of a running fixture until it prints its run root.
const rootOf = async (proc: Bun.Subprocess<"ignore", "pipe", "pipe">) => {
	let text = "";
	const reader = proc.stdout.getReader();
	while (!/ROOT=\S+\n/.test(text)) {
		const { value, done } = await reader.read();
		if (done) throw new Error(`the fixture exited before it printed its root: ${text}`);
		text += new TextDecoder().decode(value);
	}
	reader.releaseLock();
	return rootIn(text);
};

const hang = () =>
	Bun.spawn(["bun", "test", fixture], {
		cwd: repoRoot,
		env: envOf("hang"),
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});

// The pid of a process that ran and exited.
const deadPid = () => Bun.spawnSync(["true"]).pid;

describe("the per-run test root", () => {
	test("every home of the run sits under one root in the temp directory", () => {
		const root = process.env.TRELLIS_TEST_ROOT!;
		expect(join(root, "..")).toBe(join(tmpdir()));
		expect(basename(root).startsWith(`${RUN_ROOT_PREFIX}${process.pid}-`)).toBe(true);
		expect(process.env.TRELLIS_HOME!.startsWith(`${root}/`)).toBe(true);
		expect(process.env.HOME!.startsWith(`${root}/`)).toBe(true);
	});

	test("a normal run removes its root", () => {
		const run = Bun.spawnSync(["bun", "test", fixture], {
			cwd: repoRoot,
			env: envOf("pass"),
			stdout: "pipe",
			stderr: "pipe",
		});
		const output = run.stdout.toString() + run.stderr.toString();
		expect(run.exitCode, output).toBe(0);
		const root = rootIn(output);
		expect(basename(root).startsWith(RUN_ROOT_PREFIX)).toBe(true);
		expect(existsSync(root)).toBe(false);
	}, 30_000);

	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		test(`a run stopped with ${signal} removes its root`, async () => {
			const proc = hang();
			const root = await rootOf(proc);
			expect(existsSync(root)).toBe(true);
			proc.kill(signal);
			await proc.exited;
			expect(existsSync(root)).toBe(false);
		}, 30_000);
	}

	// SIGKILL stops a process before any of its code runs, so the next run
	// removes the root that the killed run left.
	test("the preload of the next run removes the root of a killed run", async () => {
		const proc = hang();
		const root = await rootOf(proc);
		expect(existsSync(root)).toBe(true);
		proc.kill("SIGKILL");
		await proc.exited;
		const next = Bun.spawnSync(["bun", "test", fixture], {
			cwd: repoRoot,
			env: envOf("pass"),
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(next.exitCode, next.stderr.toString()).toBe(0);
		expect(existsSync(root)).toBe(false);
	}, 30_000);
});

describe("sweepDeadRoots", () => {
	test("removes the roots whose owner pid is dead and keeps every other entry", () => {
		const parent = mkdtempSync(join(process.env.TRELLIS_HOME!, "sweep-"));
		const dead = `${RUN_ROOT_PREFIX}${deadPid()}-aaaaaa`;
		const live = `${RUN_ROOT_PREFIX}${process.pid}-bbbbbb`;
		for (const name of [dead, live, "trellis-test-cccccc", "unrelated"])
			mkdirSync(join(parent, name, "home"), { recursive: true });
		sweepDeadRoots(parent, RUN_ROOT_PREFIX);
		expect(readdirSync(parent).sort()).toEqual([live, "trellis-test-cccccc", "unrelated"].sort());
	});

	test("a root of another prefix is not swept", () => {
		const parent = mkdtempSync(join(process.env.TRELLIS_HOME!, "sweep-"));
		const e2e = `trellis-e2e-${deadPid()}-dddddd`;
		mkdirSync(join(parent, e2e));
		sweepDeadRoots(parent, RUN_ROOT_PREFIX);
		expect(readdirSync(parent)).toEqual([e2e]);
		sweepDeadRoots(parent, "trellis-e2e-");
		expect(readdirSync(parent)).toEqual([]);
	});

	test("createRunRoot names the root with the prefix and the pid of the process", () => {
		const parent = mkdtempSync(join(process.env.TRELLIS_HOME!, "create-"));
		const root = createRunRoot(parent, "trellis-e2e-");
		expect(existsSync(root)).toBe(true);
		expect(basename(root).startsWith(`trellis-e2e-${process.pid}-`)).toBe(true);
	});
});
